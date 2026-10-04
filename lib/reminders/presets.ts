import { dateIn, formatTime, zonedDate } from "@/lib/time";
import { eveningAt, inMinutes, tomorrowAt } from "./when";

export { EVENING, MORNING } from "./when";

const MINUTE = 60_000;
/** Krok minut w wyborze godziny. */
export const MINUTE_STEP = 5;

export const QUICK_PRESETS = [
  { id: "15m", label: "Za 15 min" },
  { id: "1h", label: "Za 1 h" },
  { id: "evening", label: "Wieczorem" },
  { id: "tomorrow", label: "Jutro 9:00" },
] as const;

export type PresetId = (typeof QUICK_PRESETS)[number]["id"];

/**
 * Termin szybkiego wyboru liczony od `now` (w chwili dodania, nie otwarcia panelu).
 * „Wieczorem” = dziś 19:00, a od 19:00 – jutro 19:00.
 */
export function presetAt(id: PresetId, now: Date, timeZone: string): Date {
  switch (id) {
    case "15m":
      return inMinutes(now, 15);
    case "1h":
      return inMinutes(now, 60);
    case "evening":
      return eveningAt(now, timeZone);
    case "tomorrow":
      return tomorrowAt(now, timeZone);
  }
}

export type CustomSlot = { date: string; time: string };

/** Najwcześniejszy termin do wyboru: następna pełna 5-minutówka (co najmniej minuta od teraz). */
export function earliestSlot(now: Date, timeZone: string): CustomSlot {
  const step = MINUTE_STEP * MINUTE;
  const at = new Date(Math.ceil((now.getTime() + MINUTE) / step) * step);
  return { date: dateIn(at, timeZone), time: formatTime(at, timeZone) };
}

/** Termin z przeszłości (np. dziś, godzina już minęła) przesuwa się na najwcześniejszy możliwy. */
export function clampSlot(slot: CustomSlot, now: Date, timeZone: string): CustomSlot {
  return zonedDate(slot.date, slot.time, timeZone).getTime() > now.getTime() ? slot : earliestSlot(now, timeZone);
}

/** Wartość pola godziny/minut o `by` kroków, z zawinięciem (23 → 0, 55 → 0). */
export function stepValue(value: number, by: number, step: number, max: number): number {
  const count = Math.floor(max / step) + 1;
  const index = Math.round(value / step);
  return (((index + by) % count) + count) % count * step;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function splitTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return { hour, minute };
}

export function joinTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}
