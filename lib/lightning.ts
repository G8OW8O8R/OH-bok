import type { VisibilitySource } from "@/lib/frame-loop";

/**
 * Pioruny: losowe odstępy 6–15 s, błysk 100–200 ms (jedno albo dwa mignięcia),
 * czasem bez pioruna (rozświetlone chmury). Twardy limit: najwyżej 3 błyski w dowolnej
 * sekundzie (WCAG 2.3.1). Przy reduced motion warstwa w ogóle się nie montuje.
 */

export const STRIKE_INTERVAL_MS = { min: 6000, max: 15000 } as const;
export const FLASH_DURATION_MS = { min: 100, max: 200 } as const;
export const MAX_FLASHES_PER_SECOND = 3;
/** Szansa na błysk bez pioruna (same chmury). */
export const CLOUD_FLASH_CHANCE = 0.3;
/** Szansa na drugie mignięcie w tym samym błysku. */
export const DOUBLE_FLASH_CHANCE = 0.5;

export interface FlashPulse {
  /** Początek mignięcia względem początku błysku (ms). */
  at: number;
  duration: number;
  /** Szczyt jasności, 0–1 (motion value `flash`). */
  peak: number;
}

export interface Strike {
  /** Indeks obrazu pioruna albo null = rozświetlone chmury. */
  bolt: number | null;
  pulses: FlashPulse[];
  /** Całkowity czas błysku (ms). */
  duration: number;
}

function between(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function nextStrikeDelay(random: () => number = Math.random): number {
  return Math.round(between(STRIKE_INTERVAL_MS.min, STRIKE_INTERVAL_MS.max, random()));
}

export function planStrike(random: () => number = Math.random, boltCount = 3, forceBolt = false): Strike {
  const cloud = random() < CLOUD_FLASH_CHANCE && !forceBolt;
  const bolt = cloud ? null : Math.min(boltCount - 1, Math.floor(random() * boltCount));
  const peak = bolt === null ? 0.7 : 1;
  if (random() < DOUBLE_FLASH_CHANCE) {
    const first = Math.round(between(60, 90, random()));
    const gap = Math.round(between(25, 45, random()));
    const second = Math.round(between(35, 60, random()));
    const pulses = [
      { at: 0, duration: first, peak },
      { at: first + gap, duration: second, peak: peak * 0.55 },
    ];
    return { bolt, pulses, duration: first + gap + second };
  }
  const duration = Math.round(between(FLASH_DURATION_MS.min, 150, random()));
  return { bolt, pulses: [{ at: 0, duration, peak }], duration };
}

/**
 * Klatki kluczowe jasności błysku (dla `animate` z `times`): szybkie rozjaśnienie,
 * wolniejsze wygaszanie w każdym mignięciu, między mignięciami ciemno.
 */
export function flashKeyframes(strike: Strike): { values: number[]; times: number[]; duration: number } {
  const values: number[] = [0];
  const times: number[] = [0];
  const total = Math.max(1, strike.duration);
  for (const pulse of strike.pulses) {
    const rise = Math.min(20, pulse.duration * 0.25);
    if (pulse.at > 0) {
      values.push(0);
      times.push(pulse.at / total);
    }
    values.push(pulse.peak, 0);
    times.push((pulse.at + rise) / total, (pulse.at + pulse.duration) / total);
  }
  return { values, times: times.map((t) => Math.min(1, t)), duration: total };
}

/**
 * Okno przesuwne: dopuszcza mignięcie tylko wtedy, gdy w ostatniej sekundzie (razem z nim)
 * jest ich najwyżej `max`. Pilnuje limitu niezależnie od harmonogramu.
 */
export class FlashLimiter {
  private readonly history: number[] = [];

  constructor(
    private readonly max = MAX_FLASHES_PER_SECOND,
    private readonly windowMs = 1000,
  ) {}

  /** Ile mignięć można jeszcze pokazać w chwili `at`. */
  available(at: number): number {
    while (this.history.length > 0 && this.history[0]! <= at - this.windowMs) this.history.shift();
    return Math.max(0, this.max - this.history.length);
  }

  /** Przycina błysk do limitu i rejestruje jego mignięcia. null = błysk wstrzymany. */
  admit(strike: Strike, at: number): Strike | null {
    // Mignięcia mieszczą się w 200 ms: liczymy je od początku błysku (zachowawczo).
    const allowed = this.available(at + strike.duration);
    if (allowed === 0) return null;
    const pulses = strike.pulses.slice(0, allowed);
    for (const pulse of pulses) this.history.push(at + pulse.at);
    const last = pulses[pulses.length - 1]!;
    return { ...strike, pulses, duration: last.at + last.duration };
  }
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export function browserClock(): Clock {
  return {
    now: () => performance.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle),
  };
}

interface SchedulerOptions {
  clock: Clock;
  visibility: VisibilitySource;
  onStrike: (strike: Strike) => void;
  random?: () => number;
  boltCount?: number;
  /** Pierwszy błysk po tylu ms i zawsze z piorunem (tryb demo); dalej zwykłe losowe odstępy. */
  firstStrikeMs?: number;
}

/**
 * Harmonogram błysków. Przy ukrytej karcie nie ma żadnego timera; po powrocie losuje
 * nowy odstęp (bez nadrabiania błysków, które „przypadły” w tle).
 */
export class LightningScheduler {
  private timer: number | null = null;
  private enabled = false;
  private disposed = false;
  private readonly limiter = new FlashLimiter();
  private readonly unsubscribe: () => void;
  private readonly random: () => number;
  private first: boolean;

  constructor(private readonly options: SchedulerOptions) {
    this.random = options.random ?? Math.random;
    this.first = options.firstStrikeMs !== undefined;
    this.unsubscribe = options.visibility.subscribe(() => this.update());
  }

  get scheduled(): boolean {
    return this.timer !== null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.update();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.unsubscribe();
  }

  private update(): void {
    if (!this.disposed && this.enabled && !this.options.visibility.isHidden()) this.schedule();
    else this.cancel();
  }

  private schedule(): void {
    if (this.timer !== null) return;
    const delay = this.first && this.options.firstStrikeMs !== undefined ? this.options.firstStrikeMs : nextStrikeDelay(this.random);
    this.timer = this.options.clock.setTimeout(this.fire, delay);
  }

  private cancel(): void {
    if (this.timer === null) return;
    this.options.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly fire = (): void => {
    this.timer = null;
    const forceBolt = this.first;
    this.first = false;
    const strike = this.limiter.admit(planStrike(this.random, this.options.boltCount, forceBolt), this.options.clock.now());
    if (strike) this.options.onStrike(strike);
    this.update();
  };
}
