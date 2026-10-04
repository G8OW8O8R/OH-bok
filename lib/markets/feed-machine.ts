import { backoffDelay, RECONNECT_BACKOFF, RETURN_BACKOFF } from "./backoff";

/**
 * Maszyna stanów kanału cen. Czysta funkcja: zdarzenia → nowy stan + efekty do
 * wykonania (gniazdo, timery, odpytywanie). Sieć i czas obsługuje `feed.ts`, więc przełączanie
 * źródeł da się przetestować deterministycznie.
 *
 * - start: Binance (`connecting`); brak danych w 5 s albo błąd → `fallback` (odpytywanie
 *   `/api/markets` co 30 s) i próby powrotu do Binance w tle (60 s … 5 min, z rozrzutem);
 * - po utracie działającego połączenia (błąd, zamknięcie, > 10 s ciszy) → `reconnecting`
 *   z wykładniczym opóźnieniem; po 3 nieudanych próbach → `fallback`;
 * - nieudane odpytanie zapasowego źródła albo brak sieci → `offline` (ostatnie ceny zostają).
 */
export const FEED_STATUSES = ["idle", "connecting", "live", "reconnecting", "fallback", "offline"] as const;
export type FeedStatus = (typeof FEED_STATUSES)[number];

/** Nazwy stanów w UI (stan połączenia zawsze widoczny razem ze źródłem). */
export const FEED_STATUS_LABELS: Record<FeedStatus, string> = {
  idle: "wyłączone",
  connecting: "łączenie",
  live: "na żywo",
  reconnecting: "ponowne łączenie",
  fallback: "zapasowe źródło",
  offline: "offline",
};

/** Dev override `?markets=`: `fallback` = od razu zapasowe źródło, `offline` = bez sieci. */
export const FEED_MODES = ["auto", "fallback", "offline"] as const;
export type FeedMode = (typeof FEED_MODES)[number];

export function parseFeedMode(value: unknown): FeedMode {
  return value === "fallback" || value === "offline" ? value : "auto";
}

/** Ile nieudanych prób ponownego łączenia, zanim przełączymy się na zapasowe źródło. */
export const RECONNECT_ATTEMPTS = 3;
/** Pierwsze dane z gniazda muszą przyjść w tym czasie. */
export const FIRST_DATA_TIMEOUT_MS = 5000;
/** Działające połączenie bez danych dłużej niż tyle = martwe. */
export const SILENCE_TIMEOUT_MS = 10_000;
/** Odpytywanie zapasowego źródła. */
export const POLL_INTERVAL_MS = 30_000;

export interface FeedState {
  status: FeedStatus;
  mode: FeedMode;
  network: boolean;
  socket: "closed" | "connecting" | "open";
  polling: boolean;
  /** Nieudane próby ponownego łączenia po utracie działającego połączenia. */
  reconnectAttempt: number;
  /** Próby powrotu do Binance w tle (przy zapasowym źródle). */
  returnAttempt: number;
}

export type SocketFailure = "error" | "closed" | "no-data" | "silent";

export type FeedEvent =
  | { type: "start"; online: boolean }
  | { type: "stop" }
  | { type: "socket-data" }
  | { type: "socket-failed"; reason: SocketFailure }
  | { type: "retry" }
  | { type: "poll-ok" }
  | { type: "poll-failed" }
  | { type: "network"; online: boolean };

export type FeedEffect =
  | { type: "open-socket" }
  | { type: "close-socket" }
  | { type: "schedule-retry"; delayMs: number }
  | { type: "cancel-retry" }
  | { type: "start-polling" }
  | { type: "stop-polling" };

export interface Transition {
  state: FeedState;
  effects: FeedEffect[];
}

export interface FeedContext {
  random: () => number;
}

export function initialFeedState(mode: FeedMode = "auto"): FeedState {
  return { status: "idle", mode, network: true, socket: "closed", polling: false, reconnectAttempt: 0, returnAttempt: 0 };
}

const SHUTDOWN: FeedEffect[] = [{ type: "close-socket" }, { type: "cancel-retry" }, { type: "stop-polling" }];

/** Uruchomienie (start albo powrót sieci): Binance, chyba że override mówi inaczej. */
function boot(state: FeedState, online: boolean): Transition {
  const base: FeedState = { ...initialFeedState(state.mode), network: online };
  if (state.mode === "offline" || !online) return { state: { ...base, status: "offline" }, effects: [] };
  if (state.mode === "fallback") {
    return { state: { ...base, status: "fallback", polling: true }, effects: [{ type: "start-polling" }] };
  }
  return { state: { ...base, status: "connecting", socket: "connecting" }, effects: [{ type: "open-socket" }] };
}

/** Zapasowe źródło + (w trybie auto) zaplanowana próba powrotu do Binance. */
function toFallback(state: FeedState, ctx: FeedContext): Transition {
  const effects: FeedEffect[] = [];
  if (!state.polling) effects.push({ type: "start-polling" });
  let returnAttempt = state.returnAttempt;
  if (state.mode === "auto") {
    effects.push({ type: "schedule-retry", delayMs: backoffDelay(returnAttempt, RETURN_BACKOFF, ctx.random) });
    returnAttempt += 1;
  }
  // Status `offline` (nieudane odpytanie) zostaje do następnego wyniku odpytania.
  const status = state.status === "offline" && state.polling ? "offline" : "fallback";
  return { state: { ...state, status, polling: true, socket: "closed", returnAttempt }, effects };
}

export function transition(state: FeedState, event: FeedEvent, ctx: FeedContext): Transition {
  switch (event.type) {
    case "start":
      if (state.status !== "idle") return { state, effects: [] };
      return boot(state, event.online);

    case "stop":
      if (state.status === "idle") return { state, effects: [] };
      return { state: initialFeedState(state.mode), effects: SHUTDOWN };

    case "network": {
      if (state.status === "idle" || event.online === state.network) return { state, effects: [] };
      if (!event.online) {
        return {
          state: { ...state, status: "offline", network: false, socket: "closed", polling: false },
          effects: SHUTDOWN,
        };
      }
      return boot(state, true);
    }

    case "socket-data": {
      if (state.socket === "closed") return { state, effects: [] }; // spóźniona wiadomość starego gniazda
      if (state.status === "live") return { state: state.socket === "open" ? state : { ...state, socket: "open" }, effects: [] };
      const effects: FeedEffect[] = [{ type: "cancel-retry" }];
      if (state.polling) effects.push({ type: "stop-polling" });
      return {
        state: { ...state, status: "live", socket: "open", polling: false, reconnectAttempt: 0, returnAttempt: 0 },
        effects,
      };
    }

    case "socket-failed": {
      if (state.socket === "closed") return { state, effects: [] }; // np. `close` po `error`
      const closed: FeedState = { ...state, socket: "closed" };
      const close: FeedEffect = { type: "close-socket" };

      if (state.status === "live") {
        const delayMs = backoffDelay(0, RECONNECT_BACKOFF, ctx.random);
        return {
          state: { ...closed, status: "reconnecting", reconnectAttempt: 1 },
          effects: [close, { type: "schedule-retry", delayMs }],
        };
      }
      if (state.status === "reconnecting" && state.reconnectAttempt < RECONNECT_ATTEMPTS) {
        const delayMs = backoffDelay(state.reconnectAttempt, RECONNECT_BACKOFF, ctx.random);
        return {
          state: { ...closed, reconnectAttempt: state.reconnectAttempt + 1 },
          effects: [close, { type: "schedule-retry", delayMs }],
        };
      }
      // Pierwsze połączenie, wyczerpane próby albo nieudany powrót w tle → zapasowe źródło.
      const next = toFallback(closed, ctx);
      return { state: next.state, effects: [close, ...next.effects] };
    }

    case "retry": {
      const waiting = state.status === "reconnecting" || state.status === "fallback" || state.status === "offline";
      if (!waiting || state.mode !== "auto" || !state.network || state.socket !== "closed") return { state, effects: [] };
      return { state: { ...state, socket: "connecting" }, effects: [{ type: "open-socket" }] };
    }

    case "poll-ok":
      if (!state.polling || state.status === "live") return { state, effects: [] };
      return { state: { ...state, status: "fallback" }, effects: [] };

    case "poll-failed":
      if (!state.polling || state.status === "live") return { state, effects: [] };
      return { state: { ...state, status: "offline" }, effects: [] };
  }
}
