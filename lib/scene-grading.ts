import { NEUTRAL_TINT, toCssFilter, type Rgb, type VideoFilter } from "@/lib/scenes";

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

export type { Rgb };

/**
 * Macierz koloru kuli: `saturate(s) · diag(tint)` (kolumna j macierzy saturate razy tint[j]).
 * Barwa sceny wchodzi do istniejącego uniformu macierzy, bez osobnego uniformu.
 * W CSS barwa to warstwa `multiply` pod filtrem (tint → brightness → saturate); mnożenie
 * przez stałą jasność jest przemienne, więc wynik jest ten sam, dopóki `brightness · c ≤ 1`
 * (różni się tylko przycięciem w szczycie błysku pioruna).
 */
export function colorMatrix(s: number, tint: Rgb = NEUTRAL_TINT): Mat3 {
  const m = saturateMatrix(s);
  return [
    m[0] * tint[0], m[1] * tint[0], m[2] * tint[0],
    m[3] * tint[1], m[4] * tint[1], m[5] * tint[1],
    m[6] * tint[2], m[7] * tint[2], m[8] * tint[2],
  ];
}

/**
 * Uśredniony wpływ gradientu złotej godziny (`.scene-golden`) na wycinek sceny widziany
 * w kuli (okolice latarni i horyzontu), jako mnożniki kanałów przy `warmth = 1`.
 * Zmierzone w Chrome (2026-10-03, 1920×1080): średni stosunek pikseli z gradientem i bez niego
 * w wycinku kadru widzianym przez kulę, na jednostkę `warmth`, uśredniony dla sunny / cloudy / rain
 * (soft-light słabiej barwi jasne chmury, więc w cloudy kula jest nieco cieplejsza od tła).
 */
export const GOLDEN_ORB_TINT: Rgb = [1.2, 1.05, 0.97];

/** Barwa dla kuli: barwa sceny razy uśredniony gradient złotej godziny w danej sile. */
export function orbTint(tint: Rgb, warmth: number): Rgb {
  const w = clamp01(warmth);
  return [
    tint[0] * (1 + (GOLDEN_ORB_TINT[0] - 1) * w),
    tint[1] * (1 + (GOLDEN_ORB_TINT[1] - 1) * w),
    tint[2] * (1 + (GOLDEN_ORB_TINT[2] - 1) * w),
  ];
}

/** Kolor warstwy `multiply` w CSS dla barwy sceny. */
export function tintCss(tint: Rgb): string {
  const channel = (value: number) => Math.round(clamp01(value) * 255);
  return `rgb(${channel(tint[0])} ${channel(tint[1])} ${channel(tint[2])})`;
}

/**
 * Referencyjny grading jednego piksela (0–1), tak jak w shaderze kuli
 * (components/orb/shaders.ts): `brightness(b)`, potem macierz `colorMatrix(s, tint)`,
 * każdy krok przycięty do [0, 1] jak w filtrach SVG.
 */
export function gradePixel(rgb: Rgb, brightness: number, s: number, tint: Rgb = NEUTRAL_TINT): Rgb {
  const r = clamp01(rgb[0] * brightness);
  const g = clamp01(rgb[1] * brightness);
  const b = clamp01(rgb[2] * brightness);
  const m = colorMatrix(s, tint);
  return [
    clamp01(m[0] * r + m[3] * g + m[6] * b),
    clamp01(m[1] * r + m[4] * g + m[7] * b),
    clamp01(m[2] * r + m[5] * g + m[8] * b),
  ];
}
