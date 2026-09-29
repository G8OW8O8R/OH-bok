import type { DailyForecast } from "./schema";

export interface CurvePoint {
  x: number;
  y: number;
  date: string;
  temperatureC: number;
}

export interface TemperatureCurve {
  /** Punkty dni, które mają temperaturę (dni bez danych pomijamy). */
  points: CurvePoint[];
  /** Gładka ścieżka SVG przez punkty; pusta, gdy są mniej niż 2 punkty. */
  path: string;
  /** Ścieżka zamknięta do dolnej krawędzi (wypełnienie pod krzywą). */
  area: string;
}

interface CurveBox {
  width: number;
  height: number;
  /** Odstęp od górnej i dolnej krawędzi, żeby kropki i grubość linii się nie ucinały. */
  inset: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Mini krzywa maksymalnych temperatur (łuk pogody). Dni rozkładane równo na szerokości
 * (x = środek kolumny dnia, jak etykiety pod spodem), temperatury skalowane do wysokości.
 */
export function temperatureCurve(days: DailyForecast[], box: CurveBox): TemperatureCurve {
  const column = box.width / Math.max(days.length, 1);
  const known = days.flatMap((day, i) =>
    day.temperatureMaxC === null ? [] : [{ i, date: day.date, t: day.temperatureMaxC }],
  );
  if (known.length === 0) return { points: [], path: "", area: "" };

  const temps = known.map((k) => k.t);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  // Płaski tydzień rysujemy na środku zamiast dzielić przez zero.
  const span = max - min || 1;
  const usable = box.height - box.inset * 2;

  const points: CurvePoint[] = known.map(({ i, date, t }) => ({
    x: round(column * (i + 0.5)),
    y: round(max === min ? box.height / 2 : box.inset + (1 - (t - min) / span) * usable),
    date,
    temperatureC: t,
  }));

  if (points.length < 2) return { points, path: "", area: "" };

  // Catmull-Rom → krzywe Béziera: gładko przez każdy punkt, bez przestrzelenia ekstremów przy 1/6.
  let path = `M${points[0]?.x},${points[0]?.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = round(p1.x + (p2.x - p0.x) / 6);
    const c1y = round(p1.y + (p2.y - p0.y) / 6);
    const c2x = round(p2.x - (p3.x - p1.x) / 6);
    const c2y = round(p2.y - (p3.y - p1.y) / 6);
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const area = first && last ? `${path} L${last.x},${box.height} L${first.x},${box.height} Z` : "";
  return { points, path, area };
}
