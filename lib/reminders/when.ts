import { addDays, weekdayIndex } from "@/lib/calendar";
import { dateIn, zonedDate } from "@/lib/time";

/**
 * Terminy przypomnień wspólne dla szybkich wyborów w oknie (`presets.ts`) i parsera komend
 * Spotlightu (`lib/commands`): ta sama „wieczorem”, ten sam „rano”, to samo „za 15 min”.
 * Wszystko w strefie użytkownika; daty kalendarzowe jako `YYYY-MM-DD`.
 */

const MINUTE = 60_000;

/** Pory dnia (czas lokalny). */
export const MORNING = "09:00";
export const NOON = "12:00";
export const AFTERNOON = "15:00";
export const EVENING = "19:00";

/** `now` + `minutes`, liczone od pełnej minuty (sekundy nie przesuwają terminu). */
export function inMinutes(now: Date, minutes: number): Date {
  return new Date(Math.floor(now.getTime() / MINUTE) * MINUTE + minutes * MINUTE);
}

/** Dzisiejsza data w strefie użytkownika. */
export function todayIn(now: Date, timeZone: string): string {
  return dateIn(now, timeZone);
}

/** Dzień `date` o godzinie `time` (czas lokalny strefy). */
export function onDayAt(date: string, time: string, timeZone: string): Date {
  return zonedDate(date, time, timeZone);
}

/** Dziś o `time`, a jeśli ta godzina już minęła – jutro o `time`. */
export function nextAt(time: string, now: Date, timeZone: string): Date {
  const today = todayIn(now, timeZone);
  const at = onDayAt(today, time, timeZone);
  return at.getTime() > now.getTime() ? at : onDayAt(addDays(today, 1), time, timeZone);
}

/** „Wieczorem” = dziś 19:00, a od 19:00 – jutro 19:00. */
export function eveningAt(now: Date, timeZone: string): Date {
  return nextAt(EVENING, now, timeZone);
}

/** Jutro o `time` (domyślnie rano). */
export function tomorrowAt(now: Date, timeZone: string, time = MORNING): Date {
  return onDayAt(addDays(todayIn(now, timeZone), 1), time, timeZone);
}

/** Najbliższy dzień tygodnia `weekday` (0 = poniedziałek … 6 = niedziela) od `today` włącznie. */
export function nextWeekday(today: string, weekday: number): string {
  return addDays(today, (weekday - weekdayIndex(today) + 7) % 7);
}
