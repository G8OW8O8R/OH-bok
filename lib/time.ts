/** Formatowanie dat i godzin po polsku. Strefa zawsze jawna, żeby SSR i klient liczyły tak samo. */

const WEEKDAYS_SHORT = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"] as const;

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("pl-PL", { ...options, timeZone });
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** `20:05` */
export function formatTime(at: Date, timeZone: string): string {
  return formatter(timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** Godzina 0–23 w danej strefie. */
export function hourIn(at: Date, timeZone: string): number {
  const parts = formatter(timeZone, { hour: "numeric", hourCycle: "h23" }).formatToParts(at);
  return Number(part(parts, "hour")) % 24;
}

/** Data w danej strefie jako `YYYY-MM-DD`. */
export function dateIn(at: Date, timeZone: string): string {
  const parts = formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

/** `Pon, 29 wrz · 08:47` (zegar w prawym górnym rogu). */
export function formatClock(at: Date, timeZone: string): string {
  const parts = formatter(timeZone, { weekday: "short", day: "numeric", month: "short" }).formatToParts(at);
  const weekday = part(parts, "weekday").replace(".", "");
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized}, ${part(parts, "day")} ${part(parts, "month").replace(".", "")} · ${formatTime(at, timeZone)}`;
}

/** Skrót dnia tygodnia dla daty kalendarzowej `YYYY-MM-DD` (niezależny od strefy). */
export function weekdayShort(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return WEEKDAYS_SHORT[day] ?? "";
}

/** Pełne minuty do chwili `at` (ujemne = już minęła). */
export function minutesUntil(at: Date, now: Date): number {
  return Math.ceil((at.getTime() - now.getTime()) / 60_000);
}

/** `Za 15 min`, `Za 1 h 5 min`, `Teraz`. */
export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "Teraz";
  if (minutes < 60) return `Za ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `Za ${h} h` : `Za ${h} h ${m} min`;
}
