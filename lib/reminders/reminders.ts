import { z } from "zod";
import { dateIn, formatTime, minuteOfDay } from "@/lib/time";

export const MAX_TITLE = 60;
export const MAX_REMINDERS = 50;
export const SNOOZE_MINUTES = 10;

const MINUTE = 60_000;

export const reminderSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(MAX_TITLE),
  /** Termin: ISO z przesunięciem strefy (JSON nie przechowuje `Date`). */
  at: z.iso.datetime({ offset: true }),
  done: z.boolean(),
});

export type Reminder = z.infer<typeof reminderSchema>;

const atMs = (reminder: Reminder) => Date.parse(reminder.at);

/** Niezakończone, od najwcześniejszego. */
export function pendingReminders(reminders: Reminder[]): Reminder[] {
  return reminders.filter((r) => !r.done).sort((a, b) => atMs(a) - atMs(b));
}

/**
 * Najbliższe niezakończone przypomnienie (po terminie też, dopóki nie zostanie odłożone
 * albo odhaczone). Jedyne źródło prawdy dla pigułki, osi czasu i briefu.
 */
export function nextReminder(reminders: Reminder[]): Reminder | null {
  return pendingReminders(reminders)[0] ?? null;
}

export function isDue(reminder: Reminder, now: Date): boolean {
  return atMs(reminder) <= now.getTime();
}

export function addReminder(reminders: Reminder[], input: { title: string; at: Date }, id: string): Reminder[] {
  if (reminders.length >= MAX_REMINDERS) return reminders;
  return [...reminders, { id, title: input.title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE), at: input.at.toISOString(), done: false }];
}

export function snoozeReminder(reminders: Reminder[], id: string, now: Date, minutes = SNOOZE_MINUTES): Reminder[] {
  const at = new Date(now.getTime() + minutes * MINUTE).toISOString();
  return reminders.map((r) => (r.id === id ? { ...r, at, done: false } : r));
}

export function completeReminder(reminders: Reminder[], id: string): Reminder[] {
  return reminders.map((r) => (r.id === id ? { ...r, done: true } : r));
}

export function removeReminder(reminders: Reminder[], id: string): Reminder[] {
  return reminders.filter((r) => r.id !== id);
}

const SLOT_STEP = 30;
const DAY_START = 8 * 60;
const DAY_END = 20 * 60;

/**
 * Najbliższa pełna godzina lub pół godziny nie wcześniej niż `from`, w przedziale 8:00–20:00
 * czasu lokalnego; poza nim najbliższe 8:00 (w razie potrzeby jutro).
 */
export function nextSlot(from: Date, timeZone: string): Date {
  const base = Math.floor(from.getTime() / MINUTE) * MINUTE;
  const local = minuteOfDay(new Date(base), timeZone);
  const rounding = (SLOT_STEP - (local % SLOT_STEP)) % SLOT_STEP;
  const slotLocal = (local + rounding) % 1440;
  let at = base + rounding * MINUTE;
  if (slotLocal < DAY_START || slotLocal > DAY_END) {
    at += ((DAY_START - slotLocal + 1440) % 1440) * MINUTE;
  }
  return new Date(at);
}

/** Przypomnienia na pierwszą wizytę: sensowne pory, pierwsze za ok. 20 min–pół godziny. */
export function starterReminders(now: Date, timeZone: string): Reminder[] {
  const first = nextSlot(new Date(now.getTime() + 20 * MINUTE), timeZone);
  const second = nextSlot(new Date(first.getTime() + 90 * MINUTE), timeZone);
  const third = nextSlot(new Date(second.getTime() + 90 * MINUTE), timeZone);
  return [
    { id: "starter-dentysta", title: "Dentysta", at: first.toISOString(), done: false },
    { id: "starter-zespol", title: "Zespół", at: second.toISOString(), done: false },
    { id: "starter-paczka", title: "Paczka", at: third.toISOString(), done: false },
  ];
}

export type ReminderInput = { title: string; at: Date };
export type ParsedReminder = { ok: true; title: string; at: Date } | { ok: false; error: string };

/** Formularz → przypomnienie: tytuł po walidacji i termin w przyszłości. */
export function parseReminderInput(input: ReminderInput, now: Date): ParsedReminder {
  const title = z.string().trim().min(1).max(MAX_TITLE).safeParse(input.title);
  if (!title.success) return { ok: false, error: input.title.trim() ? `Tytuł może mieć najwyżej ${MAX_TITLE} znaków.` : "Wpisz, o czym przypomnieć." };
  if (Number.isNaN(input.at.getTime())) return { ok: false, error: "Wybierz datę i godzinę." };
  if (input.at.getTime() <= now.getTime()) return { ok: false, error: "Termin musi być w przyszłości." };
  return { ok: true, title: title.data, at: input.at };
}

/** Domyślny termin w wyborze „Inna data”: za ok. pół godziny, o rozsądnej porze. */
export function defaultReminderInput(now: Date, timeZone: string): { date: string; time: string } {
  const at = nextSlot(new Date(now.getTime() + 30 * MINUTE), timeZone);
  return { date: dateIn(at, timeZone), time: formatTime(at, timeZone) };
}
