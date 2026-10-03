/**
 * Widoczność strony: abstrakcja nad `document.hidden` / `visibilitychange`,
 * żeby pętle warstw dało się testować bez przeglądarki.
 */
export interface VisibilitySource {
  isHidden(): boolean;
  /** Zwraca funkcję wypisującą. */
  subscribe(listener: () => void): () => void;
}

export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export function documentVisibility(doc: Document = document): VisibilitySource {
  return {
    isHidden: () => doc.hidden,
    subscribe: (listener) => {
      doc.addEventListener("visibilitychange", listener);
      return () => doc.removeEventListener("visibilitychange", listener);
    },
  };
}

export function animationFrames(): FrameScheduler {
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
  };
}

/** Najdłuższy krok symulacji: po zamrożeniu karty krople nie przeskakują przez cały ekran. */
export const MAX_FRAME_DT_S = 0.1;

/**
 * Pętla `requestAnimationFrame`, która stoi przy ukrytej karcie i gdy jest wyłączona
 * (np. reduced motion). Pierwsza klatka po wznowieniu ma dt = 0.
 */
export class FrameLoop {
  private handle: number | null = null;
  private lastAt = 0;
  private enabled = false;
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly tick: (dt: number, now: number) => void,
    private readonly visibility: VisibilitySource,
    private readonly scheduler: FrameScheduler,
  ) {
    this.unsubscribe = visibility.subscribe(() => this.update());
  }

  get running(): boolean {
    return this.handle !== null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.update();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.unsubscribe();
  }

  private update(): void {
    if (!this.disposed && this.enabled && !this.visibility.isHidden()) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.handle !== null) return;
    this.lastAt = 0;
    this.handle = this.scheduler.request(this.frame);
  }

  private stop(): void {
    if (this.handle === null) return;
    this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private readonly frame = (now: number): void => {
    this.handle = this.scheduler.request(this.frame);
    const dt = this.lastAt ? Math.min((now - this.lastAt) / 1000, MAX_FRAME_DT_S) : 0;
    this.lastAt = now;
    this.tick(dt, now);
  };
}
