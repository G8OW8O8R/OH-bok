/**
 * Przekazanie poster → wideo. Poster jest klatką 0, więc wideo może go zakryć
 * dopiero wtedy, gdy na ekranie jest właśnie klatka 0.
 */

/** Klatkaż nagrań sceny. */
export const SCENE_FPS = 24;

/** Pół klatki tolerancji: `mediaTime` klatki 0 bywa raportowany jako np. 0.0002. */
const FIRST_FRAME_TOLERANCE = 0.5 / SCENE_FPS;

/** Ile razy cofamy do klatki 0, zanim odsłonimy wideo mimo wszystko (nigdy nie blokujemy sceny). */
export const MAX_REWINDS = 2;

export function isFirstFrame(mediaTime: number): boolean {
  return mediaTime >= 0 && mediaTime < FIRST_FRAME_TOLERANCE;
}

export type HandoffStep = "reveal" | "rewind";

/**
 * Decyzja po zaprezentowaniu klatki: odsłonić wideo, czy cofnąć do klatki 0
 * (przeglądarka pokazała najpierw późniejszą klatkę).
 */
export function handoffStep(mediaTime: number, rewinds: number): HandoffStep {
  if (isFirstFrame(mediaTime) || rewinds >= MAX_REWINDS) return "reveal";
  return "rewind";
}
