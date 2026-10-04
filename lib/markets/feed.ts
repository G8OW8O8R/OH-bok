import {
  FIRST_DATA_TIMEOUT_MS,
  initialFeedState,
  POLL_INTERVAL_MS,
  SILENCE_TIMEOUT_MS,
  transition,
  type FeedEffect,
  type FeedEvent,
  type FeedMode,
  type FeedState,
  type SocketFailure,
} from "./feed-machine";
import { normalizeBinanceMiniTicker } from "./normalize";
import { marketsSnapshotSchema, type Quote } from "./schema";
import { MARKET_ASSETS, MARKET_SYMBOLS } from "./symbols";
import { TickBatcher, type FrameScheduler } from "./tick-batcher";

/**
 * Kanał cen w przeglądarce: wykonuje efekty maszyny stanów (`feed-machine.ts`) –
 * gniazdo Binance (strumień miniTicker), timery martwego połączenia, odpytywanie `/api/markets`
 * – i oddaje notowania paczkami raz na klatkę (`TickBatcher`).
 */

/** Strumienie tylko do danych rynkowych: także tam, gdzie `stream.binance.com` jest zablokowany. */
export const BINANCE_STREAM_URL = "wss://data-stream.binance.vision/stream";

export function buildStreamUrl(): string {
  const streams = MARKET_SYMBOLS.map((symbol) => `${MARKET_ASSETS[symbol].binance.toLowerCase()}@miniTicker`);
  return `${BINANCE_STREAM_URL}?streams=${streams.join("/")}`;
}

/** Część API `WebSocket`, której używamy (podmieniana w testach). */
export interface SocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(): void;
}

export interface MarketFeedDeps {
  mode: FeedMode;
  createSocket: (url: string) => SocketLike;
  fetch: typeof fetch;
  scheduler: FrameScheduler;
  random: () => number;
  isOnline: () => boolean;
  /** Nasłuch zmian sieci; zwraca funkcję sprzątającą. */
  watchNetwork: (listener: (online: boolean) => void) => () => void;
  onQuotes: (batch: Quote[]) => void;
  /** Jednorazowe wypełnienie przy starcie: tylko symbole, których jeszcze nie ma (bez zmiany źródła). */
  onSeed: (quotes: Quote[]) => void;
  onState: (state: FeedState) => void;
}

export class MarketFeed {
  private state: FeedState;
  private socket: SocketLike | null = null;
  private firstDataTimer: number | null = null;
  private silenceTimer: number | null = null;
  private retryTimer: number | null = null;
  private pollTimer: number | null = null;
  private poll: AbortController | null = null;
  private unwatchNetwork: (() => void) | null = null;
  private readonly batcher: TickBatcher<Quote>;

  constructor(private readonly deps: MarketFeedDeps) {
    this.state = initialFeedState(deps.mode);
    this.batcher = new TickBatcher<Quote>((quote) => quote.symbol, deps.onQuotes, deps.scheduler);
  }

  get current(): FeedState {
    return this.state;
  }

  start(): void {
    if (this.state.status !== "idle") return;
    this.unwatchNetwork = this.deps.watchNetwork((online) => this.dispatch({ type: "network", online }));
    this.dispatch({ type: "start", online: this.deps.isOnline() });
    // Binance wysyła tick symbolu dopiero przy zmianie (rzadkie pary nawet po kilku sekundach):
    // migawka z cache serwera od razu wypełnia puste wiersze.
    if (this.current.status === "connecting") void this.seed();
  }

  private async seed(): Promise<void> {
    const quotes = await this.fetchSnapshot(AbortSignal.timeout(FIRST_DATA_TIMEOUT_MS));
    if (quotes && this.state.status !== "idle") this.deps.onSeed(quotes.quotes);
  }

  /** `/api/markets` → notowania i informacja, czy to prawdziwe dane (nie demo). */
  private async fetchSnapshot(signal: AbortSignal): Promise<{ quotes: Quote[]; live: boolean } | null> {
    try {
      const response = await this.deps.fetch("/api/markets", { signal, cache: "no-store" });
      if (!response.ok) return null;
      const parsed = marketsSnapshotSchema.safeParse(await response.json());
      return parsed.success ? { quotes: parsed.data.quotes, live: parsed.data.source !== "demo" } : null;
    } catch {
      return null; // brak sieci albo przerwane zapytanie
    }
  }

  stop(): void {
    this.unwatchNetwork?.();
    this.unwatchNetwork = null;
    this.dispatch({ type: "stop" });
    this.batcher.flush();
  }

  private dispatch(event: FeedEvent): void {
    const { state, effects } = transition(this.state, event, { random: this.deps.random });
    const changed = state !== this.state;
    this.state = state;
    for (const effect of effects) this.run(effect);
    if (changed) this.deps.onState(state);
  }

  private run(effect: FeedEffect): void {
    switch (effect.type) {
      case "open-socket":
        this.openSocket();
        break;
      case "close-socket":
        this.closeSocket();
        break;
      case "schedule-retry":
        this.clearTimer("retryTimer");
        this.retryTimer = this.deps.scheduler.setTimeout(() => {
          this.retryTimer = null;
          this.dispatch({ type: "retry" });
        }, effect.delayMs);
        break;
      case "cancel-retry":
        this.clearTimer("retryTimer");
        break;
      case "start-polling":
        this.startPolling();
        break;
      case "stop-polling":
        this.stopPolling();
        break;
    }
  }

  private openSocket(): void {
    this.closeSocket();
    let socket: SocketLike;
    try {
      socket = this.deps.createSocket(buildStreamUrl());
    } catch {
      // Np. blokada CSP albo brak WebSocket: od razu zapasowe źródło.
      this.deps.scheduler.setTimeout(() => this.dispatch({ type: "socket-failed", reason: "error" }), 0);
      return;
    }
    this.socket = socket;
    const fail = (reason: SocketFailure) => {
      if (this.socket === socket) this.dispatch({ type: "socket-failed", reason });
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      const quote = typeof event.data === "string" ? parseMessage(event.data) : null;
      if (!quote) return; // tylko poprawne notowania świadczą o żywym połączeniu
      this.clearTimer("firstDataTimer");
      this.armSilence(() => fail("silent"));
      this.dispatch({ type: "socket-data" });
      this.batcher.push(quote);
    };
    socket.onerror = () => fail("error");
    socket.onclose = () => fail("closed");
    this.firstDataTimer = this.deps.scheduler.setTimeout(() => {
      this.firstDataTimer = null;
      fail("no-data");
    }, FIRST_DATA_TIMEOUT_MS);
  }

  private armSilence(onSilence: () => void): void {
    this.clearTimer("silenceTimer");
    this.silenceTimer = this.deps.scheduler.setTimeout(() => {
      this.silenceTimer = null;
      onSilence();
    }, SILENCE_TIMEOUT_MS);
  }

  private closeSocket(): void {
    this.clearTimer("firstDataTimer");
    this.clearTimer("silenceTimer");
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    socket.onopen = socket.onmessage = socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // Gniazdo już zamknięte.
    }
  }

  private startPolling(): void {
    this.stopPolling();
    const tick = () => {
      void this.pollOnce();
      this.pollTimer = this.deps.scheduler.setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  }

  private stopPolling(): void {
    this.clearTimer("pollTimer");
    this.poll?.abort();
    this.poll = null;
  }

  private async pollOnce(): Promise<void> {
    this.poll?.abort();
    const controller = new AbortController();
    this.poll = controller;
    const snapshot = await this.fetchSnapshot(controller.signal);
    if (controller.signal.aborted || this.poll !== controller) return;
    this.poll = null;
    // Dane demo (serwer bez żadnego źródła) trafiają do store'u z oznaczeniem, ale stan to `offline`.
    for (const quote of snapshot?.quotes ?? []) this.batcher.push(quote);
    this.dispatch({ type: snapshot?.live && snapshot.quotes.length > 0 ? "poll-ok" : "poll-failed" });
  }

  private clearTimer(name: "firstDataTimer" | "silenceTimer" | "retryTimer" | "pollTimer"): void {
    const handle = this[name];
    if (handle !== null) this.deps.scheduler.clearTimeout(handle);
    this[name] = null;
  }
}

function parseMessage(data: string): Quote | null {
  try {
    return normalizeBinanceMiniTicker(JSON.parse(data));
  } catch {
    return null;
  }
}
