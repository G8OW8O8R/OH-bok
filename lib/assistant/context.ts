import { z } from "zod";
import { pendingReminders, MAX_TITLE, type Reminder } from "@/lib/reminders/reminders";
import { weatherStateSchema } from "@/lib/scenes";
import { MAX_ITEM_NAME, type ShoppingItem } from "@/lib/shopping/list";
import { dateIn } from "@/lib/time";
import type { WeatherData } from "@/lib/weather/schema";

/**
 * Kontekst pytania: to, co asystent wie o pulpicie. Wysyła go klient (pogoda dla jego lokalizacji,
 * lista i przypomnienia są tylko w przeglądarce); serwer waliduje i przycina. Czas liczy serwer,
 * ceny pobiera sam (`getQuotes`). W prompcie to wyłącznie dane, nigdy instrukcje.
 */

export const MAX_QUERY = 300;
const MAX_SHOPPING = 40;
const MAX_REMINDERS = 5;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const temperature = z.number().min(-90).max(70).nullable();

export const contextDaySchema = z.object({
  date: z.iso.date(),
  state: weatherStateSchema,
  maxC: temperature,
  minC: temperature,
  precipitationMm: z.number().min(0).max(1000).nullable(),
  precipitationProbability: z.number().min(0).max(100).nullable(),
  windMaxKmh: z.number().min(0).max(500).nullable(),
});

export const assistantContextSchema = z.object({
  timeZone: z.string().min(1).max(64).refine(isTimeZone),
  /** „Gdańsk”, gdy użytkownik nie udostępnił lokalizacji; inaczej null (nie znamy nazwy miejsca). */
  place: z.string().max(40).nullable(),
  weather: z
    .object({
      current: z.object({ state: weatherStateSchema, temperatureC: z.number().min(-90).max(70) }),
      /** Dziś i jutro. */
      days: z.array(contextDaySchema).max(2),
      demo: z.boolean(),
    })
    .nullable(),
  shopping: z.array(z.object({ name: z.string().trim().min(1).max(MAX_ITEM_NAME), done: z.boolean() })).max(MAX_SHOPPING),
  reminders: z.array(z.object({ title: z.string().trim().min(1).max(MAX_TITLE), at: z.iso.datetime({ offset: true }) })).max(MAX_REMINDERS),
});

export type AssistantContext = z.infer<typeof assistantContextSchema>;

export const assistantRequestSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY),
  context: assistantContextSchema,
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

interface ContextInput {
  now: Date;
  timeZone: string;
  weather: WeatherData;
  shopping: readonly ShoppingItem[];
  reminders: Reminder[];
}

/** Kontekst z danych pulpitu (klient). */
export function buildAssistantContext({ now, timeZone, weather, shopping, reminders }: ContextInput): AssistantContext {
  const today = dateIn(now, timeZone);
  const days = weather.daily
    .filter((day) => day.date >= today)
    .slice(0, 2)
    .map((day) => ({
      date: day.date,
      state: day.state,
      maxC: day.temperatureMaxC,
      minC: day.temperatureMinC,
      precipitationMm: day.precipitationSumMm,
      precipitationProbability: day.precipitationProbabilityMax,
      windMaxKmh: day.windMaxKmh,
    }));
  return {
    timeZone,
    place: weather.location.isDefault ? "Gdańsk" : null,
    weather: {
      current: { state: weather.current.state, temperatureC: weather.current.temperatureC },
      days,
      demo: weather.source === "demo",
    },
    shopping: shopping.slice(0, MAX_SHOPPING).map(({ name, done }) => ({ name, done })),
    reminders: pendingReminders(reminders)
      .slice(0, MAX_REMINDERS)
      .map(({ title, at }) => ({ title, at })),
  };
}
