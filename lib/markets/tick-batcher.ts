/**
 * Grupowanie ticków do jednej klatki: z kilku wiadomości o tym samym symbolu w jednej klatce
 * zostaje ostatnia, a odbiorca dostaje jedną paczkę na klatkę.
 *
 * Na ukrytej karcie `requestAnimationFrame` nie działa, więc obok klatki planujemy zapasowy
 * timer (1 s). Wygrywa to, co nastąpi pierwsze; alerty cenowe działają też w tle.
 */
export interface FrameScheduler {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const HIDDEN_FLUSH_MS = 1000;

export class TickBatcher<T> {
  private pending = new Map<string, T>();
  private frame: number | null = null;
  private timer: number | null = null;

  constructor(
    private readonly keyOf: (item: T) => string,
    private readonly onFlush: (batch: T[]) => void,
    private readonly scheduler: FrameScheduler,
  ) {}

  push(item: T): void {
    const key = this.keyOf(item);
    // Usunięcie przed wstawieniem: kolejność w paczce = kolejność ostatnich aktualizacji.
    this.pending.delete(key);
    this.pending.set(key, item);
    if (this.frame !== null || this.timer !== null) return;
    this.frame = this.scheduler.requestFrame(() => this.flush());
    this.timer = this.scheduler.setTimeout(() => this.flush(), HIDDEN_FLUSH_MS);
  }

  /** Oddaje zebrane elementy od razu (np. przed zatrzymaniem). */
  flush(): void {
    this.cancelScheduled();
    if (this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    this.onFlush(batch);
  }

  /** Porzuca zebrane elementy i zaplanowane wywołania. */
  dispose(): void {
    this.cancelScheduled();
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }

  private cancelScheduled(): void {
    if (this.frame !== null) this.scheduler.cancelFrame(this.frame);
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.frame = null;
    this.timer = null;
  }
}
