import { wmoToWeather } from "@/lib/scenes";
import { GDANSK, type Coords } from "./coords";
import { formatUtcOffset } from "./normalize";
import type { WeatherData } from "./schema";

const DEMO_TIMEZONE = "Europe/Warsaw";
/** Deszczowy tydzień nad Zatoką Gdańską: kody WMO na kolejne dni. */
const DEMO_DAILY_CODES = [61, 63, 3, 2, 80] as const;
const DEMO_TEMPS = [
  [14, 9],
  [12, 8],
  [15, 9],
  [17, 10],
  [13, 9],
] as const;

/** Przesunięcie strefy w sekundach dla danej chwili (uwzględnia czas letni). */
function zoneOffsetSeconds(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const [, sign, h, m] = match;
  return (sign === "-" ? -1 : 1) * (Number(h) * 3600 + Number(m) * 60);
}

function localDate(at: Date, offsetSeconds: number): string {
  return new Date(at.getTime() + offsetSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Dane demo, gdy nie ma ani świeżych danych, ani cache. Zawsze oznaczone
 * `source: "demo"`, żeby UI mogło to pokazać. Lokalizacja zostaje taka, o jaką proszono.
 */
export function demoWeather(now: Date, coords: Coords | null = null): WeatherData {
  const offset = zoneOffsetSeconds(DEMO_TIMEZONE, now);
  const tz = formatUtcOffset(offset);
  const today = new Date(`${localDate(now, offset)}T12:00:00Z`);

  const daily = DEMO_DAILY_CODES.map((code, i) => {
    const date = new Date(today.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const [max, min] = DEMO_TEMPS[i] ?? [14, 9];
    return {
      date,
      weatherCode: code,
      state: wmoToWeather(code),
      temperatureMaxC: max,
      temperatureMinC: min,
      precipitationSumMm: code >= 61 ? 4.2 : 0,
      windMaxKmh: 22,
      sunrise: `${date}T06:45:00${tz}`,
      sunset: `${date}T18:20:00${tz}`,
    };
  });

  const location = coords ?? GDANSK;
  return {
    location: { lat: location.lat, lon: location.lon, isDefault: coords === null },
    timezone: DEMO_TIMEZONE,
    fetchedAt: now.toISOString(),
    source: "demo",
    current: {
      time: now.toISOString(),
      weatherCode: 61,
      state: wmoToWeather(61),
      temperatureC: 12.5,
      apparentTemperatureC: 10.8,
      precipitationMmH: 1.8,
      windKmh: 18,
      windDirectionDeg: 250,
      isDay: true,
    },
    daily,
  };
}
