import type { WeatherData } from "./schema";

/**
 * L1: ostatnie dobre dane w pamięci instancji. Ulotna i różna między instancjami,
 * więc to tylko dodatkowa siatka pod cache danych Next.js (`fetch` z `revalidate`),
 * gdy Open-Meteo nie odpowiada, a wpisu w cache danych nie ma.
 */
export interface LastKnownStore {
  get(key: string, now: Date): WeatherData | null;
  set(key: string, data: WeatherData): void;
}

export const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function createLastKnownStore(maxEntries = 200, maxAgeMs = LAST_KNOWN_MAX_AGE_MS): LastKnownStore {
  const entries = new Map<string, WeatherData>();
  return {
    get(key, now) {
      const data = entries.get(key);
      if (!data) return null;
      if (now.getTime() - Date.parse(data.fetchedAt) > maxAgeMs) {
        entries.delete(key);
        return null;
      }
      return data;
    },
    set(key, data) {
      entries.delete(key); // odświeża pozycję w kolejności LRU
      entries.set(key, data);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}
