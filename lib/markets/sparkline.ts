import { downsample } from "./normalize";
import type { HistoryPoint } from "./schema";
import { SPARKLINE_POINTS } from "./history";

export interface Sparkline {
  /** Ścieżka SVG w układzie `width × height` (oś y w dół). */
  path: string;
  /** Kierunek zmiany: ostatni punkt względem pierwszego. */
  trend: "up" | "down" | "flat";
}

/**
 * Sparkline 24 h z historii 1D: przerzedzenie, skala min–max z marginesem `pad` w pionie.
 * Płaska seria rysuje się na środku wysokości.
 */
export function sparkline(points: readonly HistoryPoint[], width: number, height: number, pad = 1): Sparkline | null {
  const series = downsample(points, SPARKLINE_POINTS);
  const first = series[0];
  const last = series.at(-1);
  if (!first || !last || series.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const { p } of series) {
    min = Math.min(min, p);
    max = Math.max(max, p);
  }
  const span = max - min;
  const t0 = first.t;
  const tSpan = last.t - t0 || 1;
  const round = (value: number) => Math.round(value * 100) / 100;
  const path = series
    .map(({ t, p }, i) => {
      const x = ((t - t0) / tSpan) * width;
      const y = span === 0 ? height / 2 : pad + (1 - (p - min) / span) * (height - 2 * pad);
      return `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
    })
    .join("");
  const trend = last.p > first.p ? "up" : last.p < first.p ? "down" : "flat";
  return { path, trend };
}
