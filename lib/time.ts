/** Formatowanie dat i godzin po polsku. Strefa zawsze jawna, żeby SSR i klient liczyły tak samo. */

const WEEKDAYS_SHORT = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"] as const;
const WEEKDAYS_LONG = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"] as const;

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

/** Pełna nazwa dnia tygodnia dla daty kalendarzowej `YYYY-MM-DD` (niezależna od strefy). */
export function weekdayLong(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return WEEKDAYS_LONG[day] ?? "";
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

/** Minuta doby (0–1439) w danej strefie. */
export function minuteOfDay(at: Date, timeZone: string): number {
  const parts = formatter(timeZone, { hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
  return (Number(part(parts, "hour")) % 24) * 60 + Number(part(parts, "minute"));
}

/** `14:30` dziś, `jutro 09:00`, dalej `Pt 09:00` (w strefie `timeZone`). */
export function formatWhen(at: Date, now: Date, timeZone: string): string {
  const day = dateIn(at, timeZone);
  const time = formatTime(at, timeZone);
  if (day === dateIn(now, timeZone)) return time;
  if (day === dateIn(new Date(now.getTime() + 86_400_000), timeZone)) return `jutro ${time}`;
  return `${weekdayShort(day)} ${time}`;
}

/** Czas publikacji (wiadomości): `14:20` dziś, `wczoraj 21:40`, dalej `Pt 09:00` (w strefie `timeZone`). */
export function formatPublished(at: Date, now: Date, timeZone: string): string {
  const day = dateIn(at, timeZone);
  const time = formatTime(at, timeZone);
  if (day === dateIn(now, timeZone)) return time;
  if (day === dateIn(new Date(now.getTime() - 86_400_000), timeZone)) return `wczoraj ${time}`;
  return `${weekdayShort(day)} ${time}`;
}

/** Rok, miesiąc (1–12), dzień, godzina, minuta w danej strefie. */
function zonedParts(at: Date, timeZone: string): [number, number, number, number, number] {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(part(parts, type));
  return [n("year"), n("month"), n("day"), n("hour") % 24, n("minute")];
}

/** Przesunięcie strefy względem UTC w chwili `at` (ms). */
function offsetMs(at: number, timeZone: string): number {
  const [y, mo, d, h, mi] = zonedParts(new Date(at), timeZone);
  return Date.UTC(y, mo - 1, d, h, mi) - Math.floor(at / 60_000) * 60_000;
}

/**
 * Data `YYYY-MM-DD` i godzina `HH:MM` czasu lokalnego w strefie `timeZone` → chwila.
 * Godzina nieistniejąca (zmiana czasu na letni) przesuwa się o godzinę dalej.
 */
export function zonedDate(date: string, time: string, timeZone: string): Date {
  const [y = NaN, mo = NaN, d = NaN] = date.split("-").map(Number);
  const [h = NaN, mi = NaN] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wall)) return new Date(NaN);
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"] as const;

/** Termin w podsumowaniu formularza: `dziś 14:30`, `jutro 09:00`, `Pt, 9 paź · 10:00`. */
export function formatDue(at: Date, now: Date, timeZone: string): string {
  const day = dateIn(at, timeZone);
  const time = formatTime(at, timeZone);
  if (day === dateIn(now, timeZone)) return `dziś ${time}`;
  if (day === dateIn(new Date(now.getTime() + 86_400_000), timeZone)) return `jutro ${time}`;
  const [, month = 1, dayOfMonth = 1] = day.split("-").map(Number);
  return `${weekdayShort(day)}, ${dayOfMonth} ${MONTHS_SHORT[month - 1] ?? ""} · ${time}`;
}
