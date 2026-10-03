import type { WeatherState } from "@/lib/scenes";
import type { DailyForecast, WeatherData } from "@/lib/weather/schema";

/**
 * Warunki, z których powstaje scena: stan pogody i parametry warstw (opad, wiatr).
 * Źródłem jest bieżąca pogoda albo dzień z prognozy (podróż w czasie).
 */
export interface SceneConditions {
  state: WeatherState;
  /** Intensywność opadu (mm/h) po uwzględnieniu minimum dla stanu. */
  intensityMmH: number;
  windKmh: number;
  /** Skąd wieje wiatr (stopnie, konwencja meteorologiczna); null = brak danych. */
  windDirectionDeg: number | null;
}

/**
 * Najsłabszy widoczny opad dla stanu: `?weather=rain` przy suchej pogodzie albo
 * „deszcz” z kodu WMO przy zerowym opadzie w bieżącym oknie też ma pokazać deszcz.
 */
const MIN_INTENSITY: Partial<Record<WeatherState, number>> = {
  drizzle: 0.3,
  rain: 2,
  snow: 1,
  storm: 8,
};

/** Mżawka zostaje mżawką: słaby deszcz niezależnie od sumy opadu. */
const MAX_INTENSITY: Partial<Record<WeatherState, number>> = {
  drizzle: 1,
};

/** Suma dobowa → mm/h: opad rzadko trwa całą dobę, przyjmujemy ok. 6 h opadu. */
export const DAILY_RAIN_HOURS = 6;

export function effectiveIntensity(state: WeatherState, mmH: number): number {
  const min = MIN_INTENSITY[state];
  if (min === undefined) return 0;
  const value = Math.max(min, Number.isFinite(mmH) ? mmH : 0);
  return Math.min(MAX_INTENSITY[state] ?? Number.POSITIVE_INFINITY, value);
}

/** Bieżące warunki; `override` (`?weather=`) zmienia stan, opad i wiatr zostają prawdziwe. */
export function currentConditions(weather: WeatherData, override: WeatherState | null): SceneConditions {
  const state = override ?? weather.current.state;
  return {
    state,
    intensityMmH: effectiveIntensity(state, weather.current.precipitationMmH),
    windKmh: weather.current.windKmh,
    windDirectionDeg: weather.current.windDirectionDeg,
  };
}

/** Warunki dnia z prognozy (scena po kliknięciu dnia). */
export function dayConditions(day: DailyForecast): SceneConditions {
  const sum = day.precipitationSumMm ?? 0;
  return {
    state: day.state,
    intensityMmH: effectiveIntensity(day.state, sum / DAILY_RAIN_HOURS),
    windKmh: day.windMaxKmh ?? 0,
    windDirectionDeg: day.windDirectionDeg,
  };
}

/**
 * Siła kropli na kuli (0–1) z intensywności opadu: skala logarytmiczna, bo różnica
 * między 0,5 a 2 mm/h widać lepiej niż między 20 a 40. Opad > 0 daje co najmniej 0,25.
 */
export function orbRainStrength(state: WeatherState, intensityMmH: number): number {
  if (state !== "drizzle" && state !== "rain" && state !== "storm") return 0;
  if (intensityMmH <= 0) return 0;
  const scaled = Math.log2(1 + intensityMmH) / Math.log2(1 + 16);
  return Math.min(1, 0.25 + 0.75 * Math.min(1, scaled));
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const COMPASS_PL: Record<(typeof COMPASS)[number], string> = {
  N: "północny",
  NE: "północno-wschodni",
  E: "wschodni",
  SE: "południowo-wschodni",
  S: "południowy",
  SW: "południowo-zachodni",
  W: "zachodni",
  NW: "północno-zachodni",
};

/** Kierunek wiatru jako skrót róży wiatrów (8 kierunków) i pełna nazwa dla czytników ekranu. */
export function compassDirection(deg: number): { short: string; long: string } {
  const normalized = ((deg % 360) + 360) % 360;
  const key = COMPASS[Math.round(normalized / 45) % 8] ?? "N";
  return { short: key, long: COMPASS_PL[key] };
}
