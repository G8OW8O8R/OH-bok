import { toCssFilter, type VideoFilter } from "@/lib/scenes";

/**
 * Grading sceny wspólny dla tła (CSS `filter`) i kuli (uniformy shadera). Obie ścieżki
 * liczą z tych samych wartości, więc fragment sceny widziany w kuli zgadza się z tłem.
 */

/** Błysk pioruna rozjaśnia scenę do `brightness(1.35)`. */
export const FLASH_BRIGHTNESS_GAIN = 0.35;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Jasność sceny z uwzględnieniem błysku (0 = brak, 1 = szczyt błysku). */
export function flashBrightness(brightness: number, flash: number): number {
  return brightness * (1 + FLASH_BRIGHTNESS_GAIN * clamp01(flash));
}

/** Filtr CSS tła: grading tokenu sceny + chwilowy błysk. */
export function sceneFilterCss(filter: VideoFilter, flash: number): string {
  return toCssFilter({ brightness: flashBrightness(filter.brightness, flash), saturate: filter.saturate });
}

/** Macierz 3×3 w kolejności kolumnowej (jak `uniformMatrix3fv` bez transpozycji). */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/**
 * Macierz `saturate(s)` ze specyfikacji Filter Effects (ta sama, której używa przeglądarka
 * dla `filter: saturate()`), zapisana kolumnowo dla GLSL.
 */
export function saturateMatrix(s: number): Mat3 {
  // Wiersze macierzy ze specyfikacji:
  // R' = (0.213 + 0.787s) R + (0.715 - 0.715s) G + (0.072 - 0.072s) B
  // G' = (0.213 - 0.213s) R + (0.715 + 0.285s) G + (0.072 - 0.072s) B
  // B' = (0.213 - 0.213s) R + (0.715 - 0.715s) G + (0.072 + 0.928s) B
  return [
    0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
    0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
    0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s,
  ];
}

export type Rgb = readonly [number, number, number];

/**
 * Referencyjny grading jednego piksela (0–1), w tej samej kolejności co CSS
 * `brightness(b) saturate(s)`: każdy krok przycięty do [0, 1] jak w filtrach SVG.
 * Shader kuli (components/orb/shaders.ts) robi dokładnie to samo.
 */
export function gradePixel(rgb: Rgb, brightness: number, s: number): Rgb {
  const r = clamp01(rgb[0] * brightness);
  const g = clamp01(rgb[1] * brightness);
  const b = clamp01(rgb[2] * brightness);
  const m = saturateMatrix(s);
  return [
    clamp01(m[0] * r + m[3] * g + m[6] * b),
    clamp01(m[1] * r + m[4] * g + m[7] * b),
    clamp01(m[2] * r + m[5] * g + m[8] * b),
  ];
}
