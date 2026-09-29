import { coordsKey, GDANSK, roundCoords, type Coords } from "./coords";
import { demoWeather } from "./demo";
import { createLastKnownStore, type LastKnownStore } from "./last-known";
import { FORECAST_DAYS, normalizeOpenMeteo } from "./normalize";
import { openMeteoResponseSchema, type WeatherData } from "./schema";

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
/** Cache danych: 30 min. */
export const WEATHER_REVALIDATE_S = 1800;
export const WEATHER_CACHE_TAG = "weather";
const UPSTREAM_TIMEOUT_MS = 4000;
/**
 * Odpowiedź, której `Date` jest najwyżej tyle przed startem zapytania, przyszła właśnie
 * z Open-Meteo, a nie z cache. Tolerancja pokrywa zaokrąglenie `Date` do pełnej sekundy
 * i różnicę zegarów serwerów.
 */
const FRESH_FETCH_WINDOW_MS = 2500;

export type WeatherCacheStatus = "hit" | "miss" | "stale" | "demo";
export type WeatherProvider = "open-meteo" | "demo";

export interface WeatherResult {
  data: WeatherData;
  cache: WeatherCacheStatus;
  provider: WeatherProvider;
}

export interface WeatherServiceDeps {
  fetch: typeof fetch;
  now: () => Date;
  lastKnown: LastKnownStore;
  onUpstreamError?: (error: unknown) => void;
}

export function buildForecastUrl(coords: Coords): string {
  const { lat, lon } = roundCoords(coords);
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "weather_code",
      "precipitation",
      "wind_speed_10m",
      "wind_direction_10m",
      "is_day",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "wind_speed_10m_max",
      "sunrise",
      "sunset",
    ].join(","),
    forecast_days: String(FORECAST_DAYS),
    timezone: "auto",
    wind_speed_unit: "kmh",
  });
  return `${OPEN_METEO_URL}?${params}`;
}

/**
 * Wiek odpowiedzi w chwili startu zapytania → status cache. Cache danych Next.js
 * zwraca zapisaną odpowiedź razem z jej oryginalnym nagłówkiem `Date`, więc stąd
 * wiadomo, jak jest stara.
 */
export function classifyAge(ageMs: number): Exclude<WeatherCacheStatus, "demo"> {
  if (ageMs < FRESH_FETCH_WINDOW_MS) return "miss";
  if (ageMs < WEATHER_REVALIDATE_S * 1000) return "hit";
  return "stale";
}

function responseDate(response: Response, fallback: Date): Date {
  const header = response.headers.get("date");
  const parsed = header ? Date.parse(header) : Number.NaN;
  return Number.isNaN(parsed) ? fallback : new Date(parsed);
}

const defaultDeps: WeatherServiceDeps = {
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  lastKnown: createLastKnownStore(),
  onUpstreamError: (error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[weather] Open-Meteo niedostępne, używam cache/demo: ${reason}`);
  },
};

/**
 * Pogoda dla współrzędnych (null = Gdańsk). Kolejność:
 * cache danych Next.js (świeży: hit, pobrany teraz: miss, przeterminowany: stale)
 * → ostatnie dane z pamięci instancji (stale) → demo. Nigdy nie rzuca wyjątku.
 */
export async function getWeather(
  requested: Coords | null,
  deps: WeatherServiceDeps = defaultDeps,
): Promise<WeatherResult> {
  const isDefault = requested === null;
  const coords = roundCoords(requested ?? GDANSK);
  const key = coordsKey(coords);
  const now = deps.now(); // start zapytania: punkt odniesienia dla wieku odpowiedzi

  try {
    const response = await deps.fetch(buildForecastUrl(coords), {
      next: { revalidate: WEATHER_REVALIDATE_S, tags: [WEATHER_CACHE_TAG] },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = openMeteoResponseSchema.parse(await response.json());
    const fetchedAt = responseDate(response, now);
    const cache = classifyAge(now.getTime() - fetchedAt.getTime());
    const data = normalizeOpenMeteo(raw, {
      location: coords,
      isDefault,
      fetchedAt,
      source: cache === "stale" ? "cache" : "live",
    });
    deps.lastKnown.set(key, data);
    return { data, cache, provider: "open-meteo" };
  } catch (error) {
    deps.onUpstreamError?.(error);
    const last = deps.lastKnown.get(key, now);
    if (last) {
      return {
        data: { ...last, source: "cache", location: { ...last.location, isDefault } },
        cache: "stale",
        provider: "open-meteo",
      };
    }
    return { data: demoWeather(now, requested === null ? null : coords), cache: "demo", provider: "demo" };
  }
}
