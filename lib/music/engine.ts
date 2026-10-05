"use client";

/**
 * Element audio i analiza dźwięku, tylko w przeglądarce. Strumień gra wprost z hosta
 * Audius. Najpierw z `crossOrigin="anonymous"`: jeśli host odpowiada nagłówkami CORS, fala w kapsule
 * czyta prawdziwe widmo (AnalyserNode). Jeśli nie – nowy element bez CORS (dźwięk gra, analizy brak,
 * fala tylko łagodnie się porusza). Element podpięty do Web Audio bez CORS grałby ciszę, dlatego
 * drugi element nigdy nie trafia do grafu.
 */

export interface EngineEvents {
  onEnded: () => void;
  /** Błąd strumienia; `corsRetry` = ten sam utwór gra dalej bez analizy (nic nie robić). */
  onError: (corsRetry: boolean) => void;
  onPlaying: () => void;
  onPause: () => void;
  /** Przeglądarka zablokowała odtwarzanie (brak gestu użytkownika). */
  onBlocked: () => void;
  onWaiting: () => void;
}

let element: HTMLAudioElement | null = null;
let cors = true;
/** Co najmniej jeden utwór zagrał z CORS: błąd to już wina utworu, nie nagłówków. */
let corsWorks = false;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let events: EngineEvents | null = null;
const timeListeners = new Set<() => void>();

function create(withCors: boolean): HTMLAudioElement {
  const audio = new Audio();
  if (withCors) audio.crossOrigin = "anonymous";
  audio.preload = "none";
  audio.addEventListener("ended", () => events?.onEnded());
  audio.addEventListener("playing", () => events?.onPlaying());
  audio.addEventListener("pause", () => events?.onPause());
  audio.addEventListener("waiting", () => events?.onWaiting());
  audio.addEventListener("timeupdate", () => timeListeners.forEach((listener) => listener()));
  audio.addEventListener("durationchange", () => timeListeners.forEach((listener) => listener()));
  audio.addEventListener("playing", () => {
    if (withCors) corsWorks = true;
  });
  audio.addEventListener("error", () => {
    if (audio !== element) return;
    if (cors && !corsWorks) {
      // Z CORS nic jeszcze nie zagrało: ten sam adres bez CORS (i bez analizy) do końca sesji.
      const src = audio.src;
      cors = false;
      element = create(false);
      element.src = src;
      events?.onError(true);
      // Błąd strumienia zgłosi zdarzenie `error`; tu tylko blokada autoodtwarzania.
      void element.play().catch(handleRejection);
      return;
    }
    events?.onError(false);
  });
  return audio;
}

/** `play()` odrzucone: blokada przeglądarki = pauza; przerwanie (nowy adres) i błąd strumienia obsłużone gdzie indziej. */
export function handleRejection(error: unknown): void {
  if (error instanceof DOMException && error.name === "NotAllowedError") events?.onBlocked();
}

function audio(): HTMLAudioElement {
  element ??= create(cors);
  return element;
}

export function bindEngine(handlers: EngineEvents): void {
  events = handlers;
}

/** Ładuje i gra adres (musi być wywołane z gestu użytkownika albo po nim). */
export async function playSource(src: string): Promise<void> {
  const target = audio();
  if (target.src !== src) target.src = src;
  connectAnalyser(target);
  await context?.resume().catch(() => undefined);
  await target.play();
}

export async function resume(): Promise<void> {
  const target = audio();
  await context?.resume().catch(() => undefined);
  await target.play();
}

export function pause(): void {
  element?.pause();
}

export function currentTime(): { position: number; duration: number } {
  const target = element;
  if (!target) return { position: 0, duration: 0 };
  const duration = Number.isFinite(target.duration) ? target.duration : 0;
  return { position: target.currentTime, duration };
}

export function subscribeTime(listener: () => void): () => void {
  timeListeners.add(listener);
  return () => timeListeners.delete(listener);
}

function connectAnalyser(target: HTMLAudioElement): void {
  if (!cors || analyser || typeof AudioContext === "undefined") return;
  try {
    context = new AudioContext();
    const source = context.createMediaElementSource(target);
    analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(context.destination);
  } catch {
    analyser = null;
  }
}

/** Analizator widma, gdy strumień ma CORS; null = fala tylko animowana. */
export function getAnalyser(): AnalyserNode | null {
  return cors ? analyser : null;
}

/**
 * Odblokowanie dźwięku w geście użytkownika (Enter w Spotlighcie): komenda wykonuje się chwilę później,
 * a Safari wymaga, by kontekst audio powstał i ruszył jeszcze w geście.
 */
export function unlockAudio(): void {
  const target = audio();
  connectAnalyser(target);
  void context?.resume().catch(() => undefined);
}
