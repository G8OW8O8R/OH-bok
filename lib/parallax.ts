/** Poziomy głębi obiektów na pulpicie. */
export type Depth = "far" | "mid" | "near";

/**
 * Maksymalne przesunięcie (px) przy kursorze na krawędzi ekranu. Bliższe obiekty
 * przesuwają się mocniej: to z różnicy prędkości bierze się wrażenie głębi.
 */
export const PARALLAX_PX: Record<Depth, number> = {
  far: 4,
  mid: 9,
  near: 16,
};

/** Pozycja kursora względem środka osi → [-1, 1]. */
export function pointerToUnit(position: number, size: number): number {
  if (size <= 0) return 0;
  const unit = (position / size) * 2 - 1;
  return Math.min(1, Math.max(-1, unit)) + 0; // + 0 zamienia -0 na 0
}

/**
 * Przesunięcie obiektu dla znormalizowanej pozycji kursora. Obiekty uciekają
 * w przeciwną stronę niż kursor, jakby kursor był głową patrzącego.
 */
export function parallaxOffset(unit: number, depth: Depth): number {
  return -unit * PARALLAX_PX[depth] + 0;
}
