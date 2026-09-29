import { wmoToWeather } from "@/lib/scenes";
import type { Coords } from "./coords";
import type { DailyForecast, OpenMeteoResponse, WeatherData, WeatherSource } from "./schema";

export const FORECAST_DAYS = 5;

/** `3600` → `+01:00`, `-12600` → `-03:30`. */
export function formatUtcOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? "-" : "+";
  const total = Math.abs(Math.round(offsetSeconds / 60));
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

/** Czas lokalny Open-Meteo (`2026-09-29T06:43`) → ISO z przesunięciem strefy. */
export function localToIso(local: string, offsetSeconds: number): string {
  const withSeconds = /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local;
  return `${withSeconds}${formatUtcOffset(offsetSeconds)}`;
}

/** Opad z okna `intervalSeconds` przeliczony na mm/h (intensywność dla RainLayer). */
export function toMmPerHour(amountMm: number, intervalSeconds: number): number {
  if (intervalSeconds <= 0) return 0;
  return Math.round(((amountMm * 3600) / intervalSeconds) * 10) / 10;
}

interface NormalizeOptions {
  location: Coords;
  isDefault: boolean;
  fetchedAt: Date;
  source: WeatherSource;
}

export function normalizeOpenMeteo(raw: OpenMeteoResponse, options: NormalizeOptions): WeatherData {
  const offset = raw.utc_offset_seconds;
  const { current, daily } = raw;
  const optionalIso = (value: string | null | undefined) => (value ? localToIso(value, offset) : null);

  const days: DailyForecast[] = daily.time.slice(0, FORECAST_DAYS).map((date, i) => {
    const code = daily.weather_code[i] ?? null;
    return {
      date,
      weatherCode: code,
      state: wmoToWeather(code ?? -1),
      temperatureMaxC: daily.temperature_2m_max[i] ?? null,
      temperatureMinC: daily.temperature_2m_min[i] ?? null,
      precipitationSumMm: daily.precipitation_sum[i] ?? null,
      windMaxKmh: daily.wind_speed_10m_max[i] ?? null,
      sunrise: optionalIso(daily.sunrise[i]),
      sunset: optionalIso(daily.sunset[i]),
    };
  });

  return {
    location: { lat: options.location.lat, lon: options.location.lon, isDefault: options.isDefault },
    timezone: raw.timezone,
    fetchedAt: options.fetchedAt.toISOString(),
    source: options.source,
    current: {
      time: localToIso(current.time, offset),
      weatherCode: current.weather_code,
      state: wmoToWeather(current.weather_code),
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      precipitationMmH: toMmPerHour(current.precipitation, current.interval),
      windKmh: current.wind_speed_10m,
      windDirectionDeg: current.wind_direction_10m,
      isDay: current.is_day === 1,
    },
    daily: days,
  };
}
