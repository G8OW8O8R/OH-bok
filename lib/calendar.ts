/**
 * Kalendarz do wyboru daty (polskie nazwy, tydzień od poniedziałku). Daty kalendarzowe
 * to `YYYY-MM-DD` bez strefy – arytmetyka w UTC, więc zmiana czasu niczego nie przesuwa.
 */

export const MONTHS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
] as const;

const MONTHS_GENITIVE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

/** Nagłówki kolumn od poniedziałku: skrót widoczny + pełna nazwa dla czytników ekranu. */
export const WEEKDAYS = [
  { short: "Pn", long: "poniedziałek" },
  { short: "Wt", long: "wtorek" },
  { short: "Śr", long: "środa" },
  { short: "Cz", long: "czwartek" },
  { short: "Pt", long: "piątek" },
  { short: "Sb", long: "sobota" },
  { short: "Nd", long: "niedziela" },
] as const;

const DAY = 86_400_000;

export interface MonthRef {
  year: number;
  /** 0–11 */
  month: number;
}

function toUtc(date: string): number {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const at = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY);
}

/** Ten sam dzień miesiąca `months` dalej; 31 sty + 1 mies. = 28/29 lut. */
export function addMonths(date: string, months: number): string {
  const at = new Date(toUtc(date));
  const target = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(at.getUTCDate(), lastDay));
  return fromUtc(target.getTime());
}

export function monthOf(date: string): MonthRef {
  const at = new Date(toUtc(date));
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() };
}

export function shiftMonth(ref: MonthRef, by: number): MonthRef {
  const at = new Date(Date.UTC(ref.year, ref.month + by, 1));
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() };
}

/** Porównanie miesięcy: < 0, 0, > 0. */
export function compareMonths(a: MonthRef, b: MonthRef): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** Dzień tygodnia 0 = poniedziałek … 6 = niedziela. */
export function weekdayIndex(date: string): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

/**
 * Siatka miesiąca: zawsze 6 tygodni × 7 dni od poniedziałku (stała wysokość przy zmianie
 * miesiąca). Dni sąsiednich miesięcy to `null` – puste komórki.
 */
export function monthGrid({ year, month }: MonthRef): (string | null)[][] {
  const first = fromUtc(Date.UTC(year, month, 1));
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = addDays(start, week * 7 + day);
      return monthOf(date).month === month ? date : null;
    }),
  );
}

/** `Październik 2026` */
export function formatMonth({ year, month }: MonthRef): string {
  return `${MONTHS[month] ?? ""} ${year}`;
}

/** `piątek, 9 października 2026` (etykieta komórki dla czytników ekranu). */
export function formatDayLabel(date: string): string {
  const at = new Date(toUtc(date));
  const weekday = WEEKDAYS[weekdayIndex(date)]?.long ?? "";
  return `${weekday}, ${at.getUTCDate()} ${MONTHS_GENITIVE[at.getUTCMonth()] ?? ""} ${at.getUTCFullYear()}`;
}

/**
 * Ruch fokusu w siatce dat (wzorzec APG „date picker dialog”): strzałki ±1/±7 dni,
 * Home/End – początek/koniec tygodnia, PageUp/PageDown – miesiąc. Nigdy przed `min`.
 * `null` = klawisz nie dotyczy siatki.
 */
export function moveDate(date: string, key: string, min: string): string | null {
  let next: string;
  switch (key) {
    case "ArrowLeft":
      next = addDays(date, -1);
      break;
    case "ArrowRight":
      next = addDays(date, 1);
      break;
    case "ArrowUp":
      next = addDays(date, -7);
      break;
    case "ArrowDown":
      next = addDays(date, 7);
      break;
    case "Home":
      next = addDays(date, -weekdayIndex(date));
      break;
    case "End":
      next = addDays(date, 6 - weekdayIndex(date));
      break;
    case "PageUp":
      next = addMonths(date, -1);
      break;
    case "PageDown":
      next = addMonths(date, 1);
      break;
    default:
      return null;
  }
  return next < min ? min : next;
}
