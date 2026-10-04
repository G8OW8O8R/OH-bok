import { z } from "zod";

export interface Size {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

/** Zapas wokół obszaru okien (px): krawędzie ekranu, a u dołu miejsce na dock. */
export interface AreaInsets {
  top: number;
  bottom: number;
  side: number;
}

/**
 * Zakres przesunięcia okna od położenia wyjściowego (środek obszaru okien), przy którym całe
 * okno razem z ornamentami zostaje w obszarze. Okno większe od obszaru stoi na środku tej osi.
 */
export interface DragBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function dragBounds(size: Size, viewport: Size, insets: AreaInsets, leftExtra = 0): DragBounds {
  const areaWidth = viewport.width - insets.side * 2;
  const areaHeight = viewport.height - insets.top - insets.bottom;
  // `leftExtra`: ornament wystający w lewo poza okno (panel boczny) też musi zostać w obszarze.
  const free = (areaWidth - size.width) / 2;
  let left = leftExtra - free;
  let right = free;
  if (left > right) left = right = leftExtra / 2;
  const y = Math.max(0, (areaHeight - size.height) / 2);
  return { left: left + 0, right: right + 0, top: -y, bottom: y };
}

export function clampOffset(offset: Offset, bounds: DragBounds): Offset {
  return {
    x: Math.min(bounds.right, Math.max(bounds.left, offset.x)) + 0,
    y: Math.min(bounds.bottom, Math.max(bounds.top, offset.y)) + 0,
  };
}

/**
 * Zapamiętana pozycja: miejsce w wolnym zakresie (-1 = lewa/górna krawędź, 0 = środek,
 * 1 = prawa/dolna). Okno odsunięte do prawej krawędzi zostaje przy niej po zmianie rozmiaru ekranu.
 */
export const savedPositionSchema = z.object({
  fx: z.number().min(-1).max(1),
  fy: z.number().min(-1).max(1),
});
export type SavedPosition = z.infer<typeof savedPositionSchema>;

const ratio = (value: number, range: number) => (range > 0 ? Math.min(1, Math.max(-1, value / range)) + 0 : 0);
const round = (value: number) => Math.round(value * 1000) / 1000;

export function toSaved(offset: Offset, bounds: DragBounds): SavedPosition {
  return { fx: round(ratio(offset.x, bounds.right)), fy: round(ratio(offset.y, bounds.bottom)) };
}

export function fromSaved(saved: SavedPosition, bounds: DragBounds): Offset {
  return { x: saved.fx * bounds.right + 0, y: saved.fy * bounds.bottom + 0 };
}

/**
 * Położenie okna bez zapamiętanej pozycji: kolejne otwarte okna schodzą kaskadą w prawo i w dół,
 * żeby nie przykrywały się dokładnie (pierwsze stoi na środku).
 */
export function cascadeOffset(index: number, step: number, bounds: DragBounds): Offset {
  return clampOffset({ x: index * step, y: index * step }, bounds);
}

/** Pozycja okna przy otwarciu: zapamiętana (w granicach ekranu) albo kaskada. */
export function initialOffset(saved: SavedPosition | null | undefined, index: number, step: number, bounds: DragBounds): Offset {
  return saved ? clampOffset(fromSaved(saved, bounds), bounds) : cascadeOffset(index, step, bounds);
}

/** Arkusz (telefon): przeciągnięcie w dół o ćwierć wysokości albo szybki ruch w dół zamyka. */
export const SHEET_DISMISS = { distance: 0.25, velocity: 800, minDistance: 24 } as const;

export function shouldDismissSheet(offsetY: number, velocityY: number, height: number): boolean {
  if (offsetY < SHEET_DISMISS.minDistance) return false;
  return offsetY > height * SHEET_DISMISS.distance || velocityY > SHEET_DISMISS.velocity;
}
