import { dateIn, formatter, hourIn, zonedDate } from "@/lib/time";
import { HISTORY_RANGE_CONFIG } from "./history";
import type { HistoryPoint, HistoryRange } from "./schema";

/**
 * Wykres ceny w oknie Rynków: geometria w pikselach kontenera (jak krzywa godzinowa
 * Pogody), najbliższy punkt dla celownika, minimalna oś czasu w strefie użytkownika.
 */
export interface ChartBox {
  width: number;
  height: number;
  /** Zapas w poziomie (kropka końca i poświata nie są ucinane). */
  insetX: number;
  insetTop: number;
  insetBottom: number;
}

export interface ChartPoint extends HistoryPoint {
  x: number;
  y: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  /** Linia (pióro). */
  line: string;
  /** Obszar pod linią do dolnej krawędzi pudełka (wypełnienie gradientem). */
  area: string;
  min: number;
  max: number;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Skala min–max (płaska seria = środek wysokości), czas liniowo od pierwszego do ostatniego punktu. */
export function chartGeometry(series: readonly HistoryPoint[], box: ChartBox): ChartGeometry | null {
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
  const tSpan = last.t - first.t || 1;
  const innerW = Math.max(1, box.width - 2 * box.insetX);
  const innerH = Math.max(1, box.height - box.insetTop - box.insetBottom);
  const points = series.map(({ t, p }) => ({
    t,
    p,
    x: round(box.insetX + ((t - first.t) / tSpan) * innerW),
    y: round(span === 0 ? box.insetTop + innerH / 2 : box.insetTop + (1 - (p - min) / span) * innerH),
  }));
  const line = points.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join("");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const area = firstPoint && lastPoint ? `${line}L${lastPoint.x} ${box.height}L${firstPoint.x} ${box.height}Z` : "";
  return { points, line, area, min, max };
}

/** Indeks punktu najbliższego współrzędnej `x` (punkty rosnąco po x; wyszukiwanie binarne). */
export function nearestIndex(points: readonly { x: number }[], x: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((points[mid]?.x ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo]?.x ?? 0;
  const b = points[hi]?.x ?? 0;
  return Math.abs(x - a) <= Math.abs(b - x) ? lo : hi;
}

/**
 * Ostatni punkt podąża za ceną na żywo: w obrębie ostatniej świecy (wciąż trwa) podmieniamy jej
 * cenę, później dokładamy nowy punkt. Starsze notowanie niczego nie zmienia.
 */
export function withLivePrice(
  series: readonly HistoryPoint[],
  range: HistoryRange,
  live: HistoryPoint | null,
): readonly HistoryPoint[] {
  const last = series.at(-1);
  if (!live || !last || live.t < last.t) return series;
  if (live.t - last.t < HISTORY_RANGE_CONFIG[range].stepMs) {
    return last.p === live.p ? series : [...series.slice(0, -1), { t: last.t, p: live.p }];
  }
  return [...series, live];
}

export interface TimeTick {
  t: number;
  label: string;
}

function addDays(date: string, days: number): string {
  const [y = NaN, m = NaN, d = NaN] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function format(timeZone: string, options: Intl.DateTimeFormatOptions, t: number): string {
  return formatter(timeZone, options).format(t).replace(".", "");
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Minimalna oś czasu: 1D – pełne godziny podzielne przez 6 („12:00”), 1T – północ każdego dnia
 * („pt”), 1M – północ w poniedziałki („5 paź”). Wszystko w strefie użytkownika.
 */
export function timeTicks(range: HistoryRange, from: number, to: number, timeZone: string): TimeTick[] {
  if (!(to > from)) return [];
  const ticks: TimeTick[] = [];
  if (range === "1D") {
    for (let t = Math.ceil(from / HOUR_MS) * HOUR_MS; t <= to; t += HOUR_MS) {
      const hour = hourIn(new Date(t), timeZone);
      if (hour % 6 === 0) ticks.push({ t, label: `${hour}:00` });
    }
    return ticks;
  }
  const lastDate = dateIn(new Date(to), timeZone);
  for (let date = dateIn(new Date(from), timeZone); date <= lastDate; date = addDays(date, 1)) {
    const t = zonedDate(date, "00:00", timeZone).getTime();
    if (t < from || t > to) continue;
    if (range === "1T") ticks.push({ t, label: format(timeZone, { weekday: "short" }, t) });
    else if (new Date(`${date}T12:00:00Z`).getUTCDay() === 1) ticks.push({ t, label: format(timeZone, { day: "numeric", month: "short" }, t) });
  }
  return ticks;
}

/** Podpis punktu pod celownikiem: 1D – godzina, dłuższe zakresy – dzień i godzina. */
export function pointLabel(t: number, range: HistoryRange, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions =
    range === "1D"
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  // „czw., 1 paź” → „czw, 1 paź” (kropka skrótu przed przecinkiem wygląda jak literówka).
  return formatter(timeZone, options).format(t).replace(/\.,/g, ",");
}
