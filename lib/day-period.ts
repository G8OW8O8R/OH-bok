import { z } from "zod";
import type { DailyForecast } from "@/lib/weather/schema";

/**
 * Pora dnia sceny: scena = pogoda × pora. Pory liczone ze wschodu
 * i zachodu słońca Open-Meteo jako chwile bezwzględne (ISO z przesunięciem strefy
 * lokalizacji), więc wynik nie zależy od strefy przeglądarki ani od tego, na którą
 * datę wypada północ.
 */

export const DAY_PERIODS = ["day", "golden", "night"] as const;
export const dayPeriodSchema = z.enum(DAY_PERIODS);
export type DayPeriod = z.infer<typeof dayPeriodSchema>;

/** Złota godzina: ±45 min wokół wschodu i wokół zachodu słońca. */
export const GOLDEN_HALF_WINDOW_MS = 45 * 60_000;
/**
 * Zdarzenie dalsze niż doba nie rozstrzyga pory: noc albo dzień polarny
 * (albo brak danych) – wtedy pora wynika z `is_day`.
 */
const EVENT_HORIZON_MS = 24 * 60 * 60_000;

type SunDay = Pick<DailyForecast, "sunrise" | "sunset">;

interface SunEvent {
  at: number;
  kind: "sunrise" | "sunset";
}

function sunEvents(daily: readonly SunDay[]): SunEvent[] {
  const events: SunEvent[] = [];
  for (const day of daily) {
    for (const kind of ["sunrise", "sunset"] as const) {
      const iso = day[kind];
      if (!iso) continue;
      const at = Date.parse(iso);
      if (Number.isFinite(at)) events.push({ at, kind });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

/**
 * Pora dnia w chwili `now`.
 * - Do 45 min od wschodu lub zachodu (włącznie) = złota godzina.
 * - Poza tym rozstrzyga ostatnie wcześniejsze zdarzenie (po wschodzie dzień, po zachodzie
 *   noc), a gdy takiego nie ma – najbliższe następne (przed wschodem noc, przed zachodem dzień).
 * - Brak zdarzeń w promieniu doby (noc/dzień polarny, brak danych) = `isDay`.
 */
export function dayPeriod(now: Date, daily: readonly SunDay[], isDay: boolean): DayPeriod {
  const t = now.getTime();
  const events = sunEvents(daily).filter((event) => Math.abs(event.at - t) <= EVENT_HORIZON_MS);
  if (events.some((event) => Math.abs(event.at - t) <= GOLDEN_HALF_WINDOW_MS)) return "golden";

  const previous = events.findLast((event) => event.at <= t);
  if (previous) return previous.kind === "sunrise" ? "day" : "night";
  const next = events.find((event) => event.at > t);
  if (next) return next.kind === "sunrise" ? "night" : "day";
  return isDay ? "day" : "night";
}

/**
 * Najbliższa chwila zmiany pory po `now` (granica złotej godziny) albo null, gdy
 * prognoza jej nie zna. Zegar pulpitu budzi się dokładnie wtedy.
 */
export function nextPeriodChange(now: Date, daily: readonly SunDay[]): Date | null {
  const t = now.getTime();
  // Okno złotej godziny jest domknięte, więc pora zmienia się 1 ms po jego końcu.
  const edges = sunEvents(daily)
    .flatMap((event) => [event.at - GOLDEN_HALF_WINDOW_MS, event.at + GOLDEN_HALF_WINDOW_MS + 1])
    .filter((edge) => edge > t);
  return edges.length > 0 ? new Date(Math.min(...edges)) : null;
}

/** Dev override `?time=day|golden|night`. Nieprawidłowa wartość = brak override'u. */
export function parseTimeOverride(value: string | string[] | undefined): DayPeriod | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = dayPeriodSchema.safeParse(raw?.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}
