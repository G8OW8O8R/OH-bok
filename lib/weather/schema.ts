import { z } from "zod";
import { weatherStateSchema } from "@/lib/scenes";

/** Surowa odpowiedź Open-Meteo `/v1/forecast` dla zmiennych z `buildForecastUrl`. */
export const openMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().min(1),
  utc_offset_seconds: z.number().int(),
  current: z.object({
    /** Czas lokalny początku 15-minutowego okna, bez strefy: `2026-09-29T20:00`. */
    time: z.string(),
    /** Długość okna w sekundach (zwykle 900). */
    interval: z.number().positive(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number().int(),
    /** Suma opadu w oknie `interval`, nie mm/h. */
    precipitation: z.number().nonnegative(),
    wind_speed_10m: z.number().nonnegative(),
    wind_direction_10m: z.number(),
    is_day: z.union([z.literal(0), z.literal(1)]),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number().int().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
    wind_speed_10m_max: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()),
    wind_direction_10m_dominant: z.array(z.number().nullable()),
    // Noc polarna / dzień polarny: brak wschodu lub zachodu.
    sunrise: z.array(z.string().nullable()),
    sunset: z.array(z.string().nullable()),
  }),
  /** Godziny od północy pierwszego dnia przez wszystkie dni prognozy, czasy lokalne bez strefy. */
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    precipitation: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
    weather_code: z.array(z.number().int().nullable()),
  }),
});

export type OpenMeteoResponse = z.infer<typeof openMeteoResponseSchema>;

export const weatherSourceSchema = z.enum(["live", "cache", "demo"]);
export type WeatherSource = z.infer<typeof weatherSourceSchema>;

const isoDateTime = z.iso.datetime({ offset: true });

export const dailyForecastSchema = z.object({
  date: z.iso.date(),
  weatherCode: z.number().int().nullable(),
  state: weatherStateSchema,
  temperatureMaxC: z.number().nullable(),
  temperatureMinC: z.number().nullable(),
  precipitationSumMm: z.number().nullable(),
  windMaxKmh: z.number().nullable(),
  /** Maks. prawdopodobieństwo opadu w %. Starsze kopie w localStorage go nie mają. */
  precipitationProbabilityMax: z.number().min(0).max(100).nullable().default(null),
  /** Dominujący kierunek wiatru (skąd wieje, stopnie). Starsze kopie go nie mają. */
  windDirectionDeg: z.number().nullable().default(null),
  sunrise: isoDateTime.nullable(),
  sunset: isoDateTime.nullable(),
});

export type DailyForecast = z.infer<typeof dailyForecastSchema>;

export const hourlyForecastSchema = z.object({
  time: isoDateTime,
  state: weatherStateSchema,
  precipitationMm: z.number().nonnegative(),
  /** Prawdopodobieństwo opadu w %, gdy model go nie podaje: null. */
  precipitationProbability: z.number().min(0).max(100).nullable(),
  /** Temperatura (wykres godzinowy w oknie Pogody). Starsze kopie w localStorage jej nie mają. */
  temperatureC: z.number().nullable().default(null),
});

export type HourlyForecast = z.infer<typeof hourlyForecastSchema>;

/** Znormalizowany format pogody: jedyny, jaki widzi klient. */
export const weatherDataSchema = z.object({
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    /** true = fallback Gdańsk, użytkownik nie udostępnił lokalizacji. */
    isDefault: z.boolean(),
  }),
  timezone: z.string().min(1),
  /** Kiedy dane zostały pobrane z Open-Meteo (nie: kiedy wyszły z cache). */
  fetchedAt: isoDateTime,
  source: weatherSourceSchema,
  current: z.object({
    time: isoDateTime,
    weatherCode: z.number().int(),
    state: weatherStateSchema,
    temperatureC: z.number(),
    apparentTemperatureC: z.number(),
    /** Wilgotność względna w %. Starsze kopie jej nie mają. */
    humidityPct: z.number().min(0).max(100).nullable().default(null),
    precipitationMmH: z.number().nonnegative(),
    windKmh: z.number().nonnegative(),
    windDirectionDeg: z.number(),
    isDay: z.boolean(),
  }),
  daily: z.array(dailyForecastSchema).min(1).max(7),
  /**
   * Prognoza godzinowa od północy dziś przez wszystkie dni (brief dnia, wykres w oknie Pogody).
   * Starsze kopie w localStorage jej nie mają albo mają tylko 24 h od bieżącej godziny.
   */
  hourly: z.array(hourlyForecastSchema).max(7 * 24).default([]),
});

export type WeatherData = z.infer<typeof weatherDataSchema>;
