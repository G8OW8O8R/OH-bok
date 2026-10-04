import { dateIn, hourIn } from "@/lib/time";
import type { DailyForecast, HourlyForecast } from "./schema";

export interface HourPoint {
  x: number;
  y: number;
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
  /** Pozycja bieżącej godziny (tylko dziś), do niej linia jest przygaszona. */
  now: HourPoint | null;
  min: number;
  max: number;
}

interface CurveBox {
  width: number;
  height: number;
  inset: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Godziny jednego dnia w strefie lokalizacji (starsze kopie mają tylko 24 h od bieżącej godziny). */
export function hoursOfDay(hourly: readonly HourlyForecast[], date: string, timeZone: string): HourlyForecast[] {
  return hourly.filter((hour) => dateIn(new Date(hour.time), timeZone) === date);
}

/** Dzień/noc godziny ze wschodu i zachodu tego dnia (ikona słońca albo księżyca). */
function isDayHour(time: string, day: DailyForecast | undefined): boolean {
  if (!day?.sunrise || !day.sunset) return true;
  const t = Date.parse(time);
  return t >= Date.parse(day.sunrise) && t < Date.parse(day.sunset);
}

/**
 * Krzywa temperatury godzinowej dnia (okno Pogody). Oś x to godzina doby (0–23), więc niepełny
 * dzień rysuje się we właściwym miejscu osi; temperatury skalowane do wysokości z zapasem.
 */
export function hourlyCurve(
  hours: readonly HourlyForecast[],
  day: DailyForecast | undefined,
  timeZone: string,
  box: CurveBox,
  now: Date | null,
): HourlyCurve {
  const known = hours.flatMap((hour) => (hour.temperatureC === null ? [] : [{ hour, t: hour.temperatureC }]));
  if (known.length === 0) return { points: [], path: "", now: null, min: 0, max: 0 };
  const temps = known.map((k) => k.t);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;
  const usable = box.height - box.inset * 2;
  const step = (box.width - box.inset * 2) / 23;

  const points: HourPoint[] = known.map(({ hour, t }) => {
    const h = hourIn(new Date(hour.time), timeZone);
    return {
      x: round(box.inset + h * step),
      y: round(max === min ? box.height / 2 : box.inset + (1 - (t - min) / span) * usable),
      hour: h,
      time: hour.time,
      temperatureC: t,
      state: hour.state,
      isDay: isDayHour(hour.time, day),
    };
  });

  let path = points.length > 1 ? `M${points[0]?.x},${points[0]?.y}` : "";
  for (let i = 0; points.length > 1 && i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    path += ` C${round(p1.x + (p2.x - p0.x) / 6)},${round(p1.y + (p2.y - p0.y) / 6)} ${round(p2.x - (p3.x - p1.x) / 6)},${round(p2.y - (p3.y - p1.y) / 6)} ${p2.x},${p2.y}`;
  }

  const nowMs = now?.getTime() ?? null;
  const current =
    nowMs === null ? null : (points.find((p) => nowMs >= Date.parse(p.time) && nowMs < Date.parse(p.time) + 3_600_000) ?? null);
  return { points, path, now: current, min, max };
}
