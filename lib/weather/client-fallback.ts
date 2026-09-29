import { demoWeather } from "./demo";
import type { WeatherData } from "./schema";

/** Jak długo lokalna kopia w przeglądarce jest lepsza niż dane demo. */
export const LOCAL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface ResolveOptions {
  /** Odpowiedź z /api/weather albo null, gdy zapytanie się nie udało (np. brak sieci). */
  fetched: WeatherData | null;
  /** Ostatnie dobre dane zapisane w przeglądarce. */
  lastGood: WeatherData | null;
  now: Date;
}

function usableLocalCopy(lastGood: WeatherData | null, now: Date): WeatherData | null {
  if (!lastGood || lastGood.source === "demo") return null;
  const age = now.getTime() - Date.parse(lastGood.fetchedAt);
  if (!(age >= 0 && age <= LOCAL_CACHE_MAX_AGE_MS)) return null;
  return { ...lastGood, source: "cache" };
}

/**
 * Co pokazać po stronie klienta. Kolejność: dane z serwera (live lub jego cache)
 * → lokalna kopia (do 24 h) → demo z serwera lub wygenerowane lokalnie.
 * Bez sieci nie ma dostępu do /api/weather, więc serwerowa degradacja tu nie pomoże.
 */
export function resolveClientWeather({ fetched, lastGood, now }: ResolveOptions): WeatherData {
  if (fetched && fetched.source !== "demo") return fetched;
  return usableLocalCopy(lastGood, now) ?? fetched ?? demoWeather(now);
}

/** Czy te dane warto zapisać jako „ostatnie dobre”. */
export function isWorthKeeping(data: WeatherData): boolean {
  return data.source !== "demo";
}
