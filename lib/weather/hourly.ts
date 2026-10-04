import { dateIn, hourIn } from "@/lib/time";
import type { DailyForecast, HourlyForecast } from "./schema";

export interface HourPoint {
  x: number;
  y: number;
  /** Godzina na osi doby: 6…23, a 24 = północ dnia następnego. */
  hour: number;
  time: string;
  temperatureC: number;
  state: HourlyForecast["state"];
  isDay: boolean;
}

export interface HourlyCurve {
  points: HourPoint[];
  /** Gładka ścieżka przez punkty; pusta, gdy są mniej niż 2. */
  path: string;
  /** Ścieżka zamknięta do dolnej krawędzi (wypełnienie pod krzywą). */
  area: string;
  /** Bieżąca godzina (tylko dziś, w zakresie osi); do niej linia jest przygaszona. */
  now: HourPoint | null;
}

interface CurveBox {
  width: number;
  height: number;
  inset: number;
}

/** Oś krzywej w oknie Pogody: od rana do północy (makieta), noc nie zajmuje miejsca. */
export const DAY_AXIS = { from: 6, to: 24 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Godzina na osi doby `date` w strefie lokalizacji: 0–23 tego dnia, 24 = północ następnego,
 * null = poza tą dobą.
 */
export function axisHour(time: string, date: string, timeZone: string): number | null {
  const at = new Date(time);
  const day = dateIn(at, timeZone);
  const hour = hourIn(at, timeZone);
  if (day === date) return hour;
  if (day === nextDate(date) && hour === 0) return 24;
  return null;
}

/** Dzień/noc godziny ze wschodu i zachodu tego dnia (ikona słońca albo księżyca). */
function isDayHour(time: string, day: DailyForecast | undefined): boolean {
  if (!day?.sunrise || !day.sunset) return true;
  const t = Date.parse(time);
  return t >= Date.parse(day.sunrise) && t < Date.parse(day.sunset);
}

/**
 * Krzywa temperatury godzinowej dnia (okno Pogody) w zakresie `axis` (domyślnie 6:00–24:00).
 * Oś x to godzina, więc niepełny dzień (starsza kopia danych) rysuje się we właściwym miejscu;
 * temperatury skalowane do wysokości z zapasem.
 */
export function hourlyCurve(
  hourly: readonly HourlyForecast[],
  date: string,
  day: DailyForecast | undefined,
  timeZone: string,
  box: CurveBox,
  now: Date | null,
  axis: { from: number; to: number } = DAY_AXIS,
): HourlyCurve {
  const known = hourly.flatMap((hour) => {
    const h = axisHour(hour.time, date, timeZone);
    return hour.temperatureC === null || h === null || h < axis.from || h > axis.to ? [] : [{ hour, h, t: hour.temperatureC }];
  });
  if (known.length === 0) return { points: [], path: "", area: "", now: null };
  const temps = known.map((k) => k.t);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;
  const usable = box.height - box.inset * 2;
  const step = (box.width - box.inset * 2) / (axis.to - axis.from);

  const points: HourPoint[] = known.map(({ hour, h, t }) => ({
    x: round(box.inset + (h - axis.from) * step),
    y: round(max === min ? box.height / 2 : box.inset + (1 - (t - min) / span) * usable),
    hour: h,
    time: hour.time,
    temperatureC: t,
    state: hour.state,
    isDay: isDayHour(hour.time, day),
  }));

  let path = points.length > 1 ? `M${points[0]?.x},${points[0]?.y}` : "";
  for (let i = 0; points.length > 1 && i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    path += ` C${round(p1.x + (p2.x - p0.x) / 6)},${round(p1.y + (p2.y - p0.y) / 6)} ${round(p2.x - (p3.x - p1.x) / 6)},${round(p2.y - (p3.y - p1.y) / 6)} ${p2.x},${p2.y}`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const area = path && first && last ? `${path} L${last.x},${box.height} L${first.x},${box.height} Z` : "";

  const nowMs = now?.getTime() ?? null;
  const current =
    nowMs === null ? null : (points.find((p) => nowMs >= Date.parse(p.time) && nowMs < Date.parse(p.time) + 3_600_000) ?? null);
  return { points, path, area, now: current };
}

/**
 * Które punkty mają podpis temperatury: co 4 h od początku osi i bieżąca godzina. Znacznik co 4 h
 * tuż obok bieżącej (±1 h) ustępuje jej, żeby podpisy nie nachodziły na siebie.
 */
export function labeledHours(points: readonly HourPoint[], now: HourPoint | null, axisFrom = DAY_AXIS.from, every = 4): Set<number> {
  const hours = new Set<number>();
  for (const p of points) {
    if ((p.hour - axisFrom) % every !== 0) continue;
    if (now && p.hour !== now.hour && Math.abs(p.hour - now.hour) <= 1) continue;
    hours.add(p.hour);
  }
  if (now) hours.add(now.hour);
  return hours;
}
