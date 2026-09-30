/**
 * Watchdog klatek: jeśli urządzenie nie wyrabia płynnej animacji, kula przechodzi na CSS.
 * Mierzy tylko po zakończeniu sekwencji startowej (ładowanie strony to nie jest stan ustalony)
 * i tylko przez kilka pierwszych okien, żeby pojedyncze zacięcie później niczego nie przełączało.
 */

export interface FpsWatchdogOptions {
  /** Długość okna pomiaru (ms). */
  windowMs: number;
  /** Poniżej tej średniej okno jest „wolne”. */
  minFps: number;
  /** Ile wolnych okien z rzędu przełącza na fallback. */
  strikes: number;
  /** Po tylu oknach pomiar się kończy. */
  maxWindows: number;
  /** Dłuższa przerwa (ukryta karta, pauza pętli) przerywa okno zamiast psuć średnią. */
  maxGapMs: number;
}

export const DEFAULT_WATCHDOG: FpsWatchdogOptions = {
  windowMs: 2000,
  minFps: 50,
  strikes: 2,
  maxWindows: 5,
  maxGapMs: 250,
};

export type WatchdogVerdict = "measuring" | "slow" | "ok";

export class FpsWatchdog {
  private readonly options: FpsWatchdogOptions;
  private windowStart: number | null = null;
  private last: number | null = null;
  private frames = 0;
  private windows = 0;
  private strikes = 0;
  private verdict: WatchdogVerdict = "measuring";

  constructor(options: Partial<FpsWatchdogOptions> = {}) {
    this.options = { ...DEFAULT_WATCHDOG, ...options };
  }

  /** Znacznik czasu klatki (ms, np. z requestAnimationFrame). Zwraca bieżący werdykt. */
  frame(now: number): WatchdogVerdict {
    if (this.verdict !== "measuring") return this.verdict;

    if (this.last === null || now - this.last > this.options.maxGapMs) {
      this.restartWindow(now);
      return this.verdict;
    }

    this.last = now;
    this.frames += 1;
    const start = this.windowStart ?? now;
    const elapsed = now - start;
    if (elapsed < this.options.windowMs) return this.verdict;

    const fps = (this.frames / elapsed) * 1000;
    this.strikes = fps < this.options.minFps ? this.strikes + 1 : 0;
    this.windows += 1;
    if (this.strikes >= this.options.strikes) this.verdict = "slow";
    else if (this.windows >= this.options.maxWindows) this.verdict = "ok";
    this.restartWindow(now);
    return this.verdict;
  }

  /** Pętla stanęła (karta ukryta, kula poza ekranem): następna klatka zaczyna nowe okno. */
  pause(): void {
    this.last = null;
    this.windowStart = null;
    this.frames = 0;
  }

  get result(): WatchdogVerdict {
    return this.verdict;
  }

  private restartWindow(now: number): void {
    this.windowStart = now;
    this.last = now;
    this.frames = 0;
  }
}
