/**
 * Wykładnicze opóźnienie z losowym rozrzutem („equal jitter”): połowa okna stała, połowa losowa.
 * Rozrzut rozkłada ponowne łączenia wielu kart w czasie, a stała połowa nie pozwala na pętlę
 * bez przerwy (pełny rozrzut potrafi wylosować 0 ms).
 */
export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  factor: number;
}

/** Ponowne łączenie z Binance po utracie połączenia: 1 s, 2 s, 4 s … maks. 30 s. */
export const RECONNECT_BACKOFF: BackoffOptions = { baseMs: 1000, maxMs: 30_000, factor: 2 };

/** Próby powrotu do Binance w tle, gdy działa zapasowe źródło: 60 s, 120 s … maks. 5 min. */
export const RETURN_BACKOFF: BackoffOptions = { baseMs: 60_000, maxMs: 5 * 60_000, factor: 2 };

/** Okno opóźnienia dla próby `attempt` (od 0) bez rozrzutu. */
export function backoffWindow(attempt: number, options: BackoffOptions): number {
  const exponent = Math.max(0, Math.floor(attempt));
  return Math.min(options.maxMs, options.baseMs * options.factor ** exponent);
}

/** Opóźnienie próby `attempt` (od 0): w zakresie [okno/2, okno). `random` zwraca [0, 1). */
export function backoffDelay(attempt: number, options: BackoffOptions, random: () => number): number {
  const window = backoffWindow(attempt, options);
  const jitter = Math.min(Math.max(random(), 0), 1);
  return Math.round(window / 2 + (window / 2) * jitter);
}
