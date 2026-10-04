import { describe, expect, it, vi } from "vitest";
import { backoffDelay, backoffWindow, RECONNECT_BACKOFF, RETURN_BACKOFF } from "@/lib/markets/backoff";
import {
  initialFeedState,
  RECONNECT_ATTEMPTS,
  transition,
  type FeedEvent,
  type FeedState,
  type Transition,
} from "@/lib/markets/feed-machine";
import { HIDDEN_FLUSH_MS, TickBatcher, type FrameScheduler } from "@/lib/markets/tick-batcher";

describe("backoffDelay", () => {
  it("rośnie wykładniczo do limitu", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((n) => backoffWindow(n, RECONNECT_BACKOFF))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
    expect(backoffWindow(3, RETURN_BACKOFF)).toBe(5 * 60_000);
  });

  it("rozrzut mieści się w [okno/2, okno] i nigdy nie daje zera", () => {
    expect(backoffDelay(2, RECONNECT_BACKOFF, () => 0)).toBe(2000);
    expect(backoffDelay(2, RECONNECT_BACKOFF, () => 0.5)).toBe(3000);
    expect(backoffDelay(2, RECONNECT_BACKOFF, () => 0.999_999)).toBe(4000);
    expect(backoffDelay(0, RECONNECT_BACKOFF, () => 0)).toBe(500);
  });

  it("toleruje złe wartości (ujemna próba, random poza zakresem)", () => {
    expect(backoffDelay(-3, RECONNECT_BACKOFF, () => 7)).toBe(1000);
  });
});

/** Ręczny planista: klatki i timery wywoływane na żądanie. */
function manualScheduler() {
  let id = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const scheduler: FrameScheduler = {
    requestFrame: (callback) => (frames.set(++id, callback), id),
    cancelFrame: (handle) => void frames.delete(handle),
    setTimeout: (callback, ms) => (timers.set(++id, { callback, ms }), id),
    clearTimeout: (handle) => void timers.delete(handle),
  };
  return {
    scheduler,
    frames,
    timers,
    runFrame: () => [...frames.values()].forEach((callback) => callback()),
    runTimers: () => [...timers.values()].forEach(({ callback }) => callback()),
  };
}

interface Tick {
  symbol: string;
  price: number;
}

describe("TickBatcher", () => {
  it("z wielu ticków w klatce oddaje jedną paczkę z ostatnią ceną każdego symbolu", () => {
    const clock = manualScheduler();
    const onFlush = vi.fn<(batch: Tick[]) => void>();
    const batcher = new TickBatcher<Tick>((tick) => tick.symbol, onFlush, clock.scheduler);

    batcher.push({ symbol: "BTC", price: 1 });
    batcher.push({ symbol: "ETH", price: 2 });
    batcher.push({ symbol: "BTC", price: 3 });
    expect(clock.frames.size).toBe(1); // jedna klatka na paczkę
    expect(onFlush).not.toHaveBeenCalled();

    clock.runFrame();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0]?.[0]).toEqual([
      { symbol: "ETH", price: 2 },
      { symbol: "BTC", price: 3 },
    ]);
    // Klatka anulowała zapasowy timer.
    expect(clock.timers.size).toBe(0);
  });

  it("na ukrytej karcie (bez klatek) oddaje paczkę zapasowym timerem po 1 s", () => {
    const clock = manualScheduler();
    const onFlush = vi.fn<(batch: Tick[]) => void>();
    const batcher = new TickBatcher<Tick>((tick) => tick.symbol, onFlush, clock.scheduler);

    batcher.push({ symbol: "SOL", price: 5 });
    expect([...clock.timers.values()][0]?.ms).toBe(HIDDEN_FLUSH_MS);
    clock.runTimers();
    expect(onFlush).toHaveBeenCalledWith([{ symbol: "SOL", price: 5 }]);
    expect(clock.frames.size).toBe(0);
  });

  it("po paczce kolejny tick planuje nową klatkę; dispose porzuca zebrane", () => {
    const clock = manualScheduler();
    const onFlush = vi.fn<(batch: Tick[]) => void>();
    const batcher = new TickBatcher<Tick>((tick) => tick.symbol, onFlush, clock.scheduler);
    batcher.push({ symbol: "ADA", price: 1 });
    clock.runFrame();
    batcher.push({ symbol: "ADA", price: 2 });
    expect(clock.frames.size).toBe(1);
    batcher.dispose();
    expect(clock.frames.size).toBe(0);
    expect(batcher.size).toBe(0);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

describe("feed-machine: przełączanie źródeł", () => {
  const ctx = { random: () => 0 };

  function run(events: FeedEvent[], start: FeedState = initialFeedState()): Transition[] {
    const steps: Transition[] = [];
    let state = start;
    for (const event of events) {
      const step = transition(state, event, ctx);
      steps.push(step);
      state = step.state;
    }
    return steps;
  }
  const last = (steps: Transition[]) => steps[steps.length - 1]!;
  const types = (step: Transition) => step.effects.map((effect) => effect.type);

  it("start łączy z Binance, pierwsze dane = na żywo", () => {
    const [start, data] = run([{ type: "start", online: true }, { type: "socket-data" }]);
    expect(start?.state.status).toBe("connecting");
    expect(start && types(start)).toEqual(["open-socket"]);
    expect(data?.state.status).toBe("live");
    expect(data?.state.socket).toBe("open");
  });

  it.each(["no-data", "error", "closed"] as const)(
    "brak danych w 5 s albo błąd (%s) przy starcie → zapasowe źródło + powrót w tle",
    (reason) => {
      const step = last(run([{ type: "start", online: true }, { type: "socket-failed", reason }]));
      expect(step.state.status).toBe("fallback");
      expect(step.state.polling).toBe(true);
      expect(types(step)).toEqual(["close-socket", "start-polling", "schedule-retry"]);
      expect(step.effects[2]).toEqual({ type: "schedule-retry", delayMs: RETURN_BACKOFF.baseMs / 2 });
    },
  );

  it("utrata działającego połączenia → ponowne łączenie z rosnącym opóźnieniem, potem zapas", () => {
    const steps = run([
      { type: "start", online: true },
      { type: "socket-data" },
      { type: "socket-failed", reason: "silent" }, // > 10 s ciszy
    ]);
    let state = last(steps).state;
    expect(state.status).toBe("reconnecting");
    expect(last(steps).effects).toEqual([{ type: "close-socket" }, { type: "schedule-retry", delayMs: 500 }]);

    const delays: number[] = [];
    for (let i = 1; i < RECONNECT_ATTEMPTS; i += 1) {
      const retry = transition(state, { type: "retry" }, ctx);
      expect(types(retry)).toEqual(["open-socket"]);
      const failed = transition(retry.state, { type: "socket-failed", reason: "no-data" }, ctx);
      expect(failed.state.status).toBe("reconnecting");
      const schedule = failed.effects.find((effect) => effect.type === "schedule-retry");
      delays.push(schedule?.type === "schedule-retry" ? schedule.delayMs : -1);
      state = failed.state;
    }
    expect(delays).toEqual([1000, 2000]);

    const retry = transition(state, { type: "retry" }, ctx);
    const exhausted = transition(retry.state, { type: "socket-failed", reason: "error" }, ctx);
    expect(exhausted.state.status).toBe("fallback");
    expect(types(exhausted)).toContain("start-polling");
  });

  it("udany powrót do Binance w tle wyłącza odpytywanie", () => {
    const steps = run([
      { type: "start", online: true },
      { type: "socket-failed", reason: "no-data" },
      { type: "poll-ok" },
      { type: "retry" },
      { type: "socket-data" },
    ]);
    const back = last(steps);
    expect(back.state.status).toBe("live");
    expect(back.state.polling).toBe(false);
    expect(types(back)).toEqual(["cancel-retry", "stop-polling"]);
    expect(back.state.returnAttempt).toBe(0);
  });

  it("nieudany powrót w tle zostaje przy zapasie i wydłuża kolejną próbę", () => {
    const steps = run([
      { type: "start", online: true },
      { type: "socket-failed", reason: "no-data" },
      { type: "retry" },
      { type: "socket-failed", reason: "no-data" },
    ]);
    const step = last(steps);
    expect(step.state.status).toBe("fallback");
    expect(types(step)).toEqual(["close-socket", "schedule-retry"]); // odpytywanie już trwa
    expect(step.effects[1]).toEqual({ type: "schedule-retry", delayMs: 60_000 });
  });

  it("nieudane odpytanie zapasu = offline, udane = z powrotem zapas", () => {
    const steps = run([
      { type: "start", online: true },
      { type: "socket-failed", reason: "error" },
      { type: "poll-failed" },
    ]);
    expect(last(steps).state.status).toBe("offline");
    expect(transition(last(steps).state, { type: "poll-ok" }, ctx).state.status).toBe("fallback");
  });

  it("brak sieci zatrzymuje wszystko, powrót sieci łączy od nowa", () => {
    const steps = run([
      { type: "start", online: true },
      { type: "socket-data" },
      { type: "network", online: false },
    ]);
    expect(last(steps).state.status).toBe("offline");
    expect(types(last(steps))).toEqual(["close-socket", "cancel-retry", "stop-polling"]);
    const back = transition(last(steps).state, { type: "network", online: true }, ctx);
    expect(back.state.status).toBe("connecting");
    expect(types(back)).toEqual(["open-socket"]);
  });

  it("ignoruje spóźnione zdarzenia zamkniętego gniazda i odpytywania", () => {
    const fallback = last(run([{ type: "start", online: true }, { type: "socket-failed", reason: "error" }])).state;
    // `close` po `error` tego samego gniazda
    expect(transition(fallback, { type: "socket-failed", reason: "closed" }, ctx).effects).toEqual([]);
    expect(transition(fallback, { type: "socket-data" }, ctx).state).toBe(fallback);
    const live = last(run([{ type: "start", online: true }, { type: "socket-data" }])).state;
    expect(transition(live, { type: "poll-failed" }, ctx).state).toBe(live);
  });

  it("dev override: `fallback` bez Binance, `offline` bez sieci", () => {
    const fallback = transition(initialFeedState("fallback"), { type: "start", online: true }, ctx);
    expect(fallback.state.status).toBe("fallback");
    expect(types(fallback)).toEqual(["start-polling"]);
    expect(transition(fallback.state, { type: "retry" }, ctx).effects).toEqual([]);

    const offline = transition(initialFeedState("offline"), { type: "start", online: true }, ctx);
    expect(offline.state.status).toBe("offline");
    expect(offline.effects).toEqual([]);
  });

  it("start bez sieci = offline; stop sprząta i wraca do idle", () => {
    expect(transition(initialFeedState(), { type: "start", online: false }, ctx).state.status).toBe("offline");
    const live = last(run([{ type: "start", online: true }, { type: "socket-data" }])).state;
    const stopped = transition(live, { type: "stop" }, ctx);
    expect(stopped.state).toEqual(initialFeedState());
    expect(types(stopped)).toEqual(["close-socket", "cancel-retry", "stop-polling"]);
  });
});
