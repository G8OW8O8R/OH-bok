import { addDays } from "@/lib/calendar";
import { nextSlot } from "@/lib/reminders/reminders";
import {
  AFTERNOON,
  EVENING,
  inMinutes,
  MORNING,
  nextAt,
  nextWeekday,
  NOON,
  onDayAt,
  todayIn,
} from "@/lib/reminders/when";
import type { Phrase } from "./text";

/**
 * Daty i godziny w komendach po polsku: „jutro”, „pojutrze”, „w piątek”,
 * „za 15 minut”, „o 9”, „o 14:30”, „rano”, „wieczorem”. Terminy z `lib/reminders/when.ts` –
 * te same co szybkie wybory w oknie Przypomnień.
 */

/** Dni tygodnia w złożonej pisowni, każdy przypadek, który pada w komendach (0 = poniedziałek). */
const WEEKDAY_FORMS: readonly string[] = [
  "poniedzial(?:ek|ku)",
  "wtor(?:ek|ku)",
  "srod(?:a|e|y|zie)",
  "czwart(?:ek|ku)",
  "piat(?:ek|ku)",
  "sobot(?:a|e|y|cie)",
  "niedziel(?:a|e|i)",
];

const WEEKDAY = WEEKDAY_FORMS.map((form) => `(${form})`).join("|");

const NUMBER_WORDS: Record<string, number> = {
  jedna: 1,
  jedno: 1,
  dwie: 2,
  dwa: 2,
  trzy: 3,
  cztery: 4,
  piec: 5,
  szesc: 6,
  dziesiec: 10,
  pietnascie: 15,
  dwadziescia: 20,
  trzydziesci: 30,
  czterdziesci: 40,
};

const NUMBER = `(\\d+(?:[.,]5)?|${Object.keys(NUMBER_WORDS).join("|")}|pol|poltorej)`;

/** Dzień z komendy: przesunięcie od dziś albo dzień tygodnia. */
export type DayRef = { kind: "offset"; days: number } | { kind: "weekday"; weekday: number };

export type PartOfDay = "morning" | "noon" | "afternoon" | "evening";

export interface TimeExpression {
  /** „za 15 minut” (minuty). */
  relativeMin: number | null;
  day: DayRef | null;
  /** Godzina z komendy, jeszcze bez poprawki pory dnia. */
  clock: { hour: number; minute: number } | null;
  part: PartOfDay | null;
  /** Wyrażenie stało na samym początku komendy („za 15 minut wyjąć pranie”). */
  leading: boolean;
}

function weekdayFrom(match: RegExpExecArray, offset: number): number {
  for (let i = 0; i < WEEKDAY_FORMS.length; i += 1) if (match[offset + i]) return i;
  return 0;
}

function amount(word: string): number {
  if (word === "pol") return 0.5;
  if (word === "poltorej") return 1.5;
  return NUMBER_WORDS[word] ?? Number(word.replace(",", "."));
}

/**
 * Dzień z komendy pogodowej: „dziś”, „jutro”, „pojutrze”, „(w|we|na) czwartek”, „czwartek”.
 * Wycina dopasowanie z frazy.
 */
export function takeDay(phrase: Phrase, allowBareWeekday: boolean): DayRef | null {
  const relative = phrase.take(/\b(?:na\s+)?(dzis|dzisiaj|teraz|jutro|pojutrze)\b/);
  if (relative) {
    const word = relative[1];
    return { kind: "offset", days: word === "jutro" ? 1 : word === "pojutrze" ? 2 : 0 };
  }
  const prefix = allowBareWeekday ? "(?:(?:w|we|na)\\s+)?" : "(?:w|we|na)\\s+";
  const weekday = phrase.take(new RegExp(`\\b${prefix}(?:${WEEKDAY})\\b`));
  return weekday ? { kind: "weekday", weekday: weekdayFrom(weekday, 1) } : null;
}

/** Data kalendarzowa dnia z komendy (dzień tygodnia: najbliższy, od dziś włącznie). */
export function resolveDay(day: DayRef, today: string): string {
  return day.kind === "offset" ? addDays(today, day.days) : nextWeekday(today, day.weekday);
}

/** Wyrażenie czasu z frazy (wycięte z niej); null, gdy w komendzie nie ma żadnego. */
export function takeTime(phrase: Phrase): TimeExpression | null {
  const startsAt = phrase.key.search(/\S/);
  let first = Infinity;
  const note = (match: RegExpExecArray | null) => {
    if (match) first = Math.min(first, match.index);
    return match;
  };

  let relativeMin: number | null = null;
  const quarter = note(phrase.take(/\bza\s+kwadrans\b/));
  if (quarter) relativeMin = 15;
  const relative = quarter
    ? null
    : note(phrase.take(new RegExp(`\\bza\\s+(?:${NUMBER}\\s*)?(minut[ey]?|minute|min|godzin[ey]?|godzine|godz|h)\\b`)));
  if (relative) {
    const unit = relative[2] ?? "";
    const value = relative[1] ? amount(relative[1]) : 1;
    relativeMin = Math.round(value * (unit.startsWith("min") ? 1 : 60));
  }

  const dayStart = phrase.key.search(/\b(?:na\s+)?(dzis|dzisiaj|jutro|pojutrze)\b|\b(w|we|na)\s+(poniedzial|wtor|srod|czwart|piat|sobot|niedziel)/);
  const day = takeDay(phrase, false);
  if (day && dayStart >= 0) first = Math.min(first, dayStart);

  let clock: TimeExpression["clock"] = null;
  const at =
    note(phrase.take(/\b(?:o|na|okolo)\s+(?:godz(?:inie|\.)?\s*)?(\d{1,2})(?:[:.](\d{2}))?(?![\d\s]*(?:min|godz|h\b|zl|\$|%))/)) ??
    note(phrase.take(/\b(\d{1,2}):(\d{2})\b/));
  if (at) {
    const hour = Number(at[1]);
    const minute = at[2] ? Number(at[2]) : 0;
    if (hour <= 24 && minute <= 59) clock = { hour: hour % 24, minute };
  }

  let part: PartOfDay | null = null;
  const parts: [RegExp, PartOfDay][] = [
    [/\b(?:z\s+)?ran(?:o|a)\b/, "morning"],
    [/\bw\s+poludnie\b/, "noon"],
    [/\bpo\s+poludniu\b/, "afternoon"],
    [/\bwieczor(?:em)?\b/, "evening"],
  ];
  for (const [pattern, value] of parts) {
    if (note(phrase.take(pattern))) {
      part = value;
      break;
    }
  }

  if (relativeMin === null && day === null && clock === null && part === null) return null;
  return { relativeMin, day, clock, part, leading: first === startsAt };
}

const PART_TIME: Record<PartOfDay, string> = { morning: MORNING, noon: NOON, afternoon: AFTERNOON, evening: EVENING };

const pad = (n: number) => String(n).padStart(2, "0");

/** Godzina z poprawką pory dnia: „o 7 wieczorem” = 19:00, „o 3 po południu” = 15:00. */
function clockTime(clock: { hour: number; minute: number }, part: PartOfDay | null): string {
  const pm = (part === "evening" || part === "afternoon") && clock.hour < 12;
  return `${pad(pm ? clock.hour + 12 : clock.hour)}:${pad(clock.minute)}`;
}

/** „O 5” po 5:00 to raczej 17:00; „o 9:30” po 9:30 to raczej jutro rano. */
const PM_GUESS_MAX = 7;

export type ResolvedTime = { ok: true; at: Date } | { ok: false; error: string };

/**
 * Wyrażenie → chwila w przyszłości (strefa użytkownika):
 * - „za N min/godz.” – od teraz;
 * - dzień bez godziny – rano (9:00) albo pora dnia; „dziś” bez godziny – najbliższe pół godziny;
 * - godzina bez dnia – dziś, a jeśli minęła: 1–7 to pora popołudniowa (o 5 → 17:00), inaczej jutro;
 * - dzień tygodnia = dziś, a godzina minęła – za tydzień.
 */
export function resolveTime(expr: TimeExpression, now: Date, timeZone: string): ResolvedTime {
  if (expr.relativeMin !== null) {
    return expr.relativeMin > 0 ? { ok: true, at: inMinutes(now, expr.relativeMin) } : { ok: false, error: "Podaj, za ile minut." };
  }
  const today = todayIn(now, timeZone);
  const future = (at: Date) => at.getTime() > now.getTime();
  const afternoonVariant = (date: string) => {
    if (!expr.clock || expr.part || expr.clock.hour < 1 || expr.clock.hour > PM_GUESS_MAX) return null;
    const pm = onDayAt(date, clockTime({ hour: expr.clock.hour + 12, minute: expr.clock.minute }, null), timeZone);
    return future(pm) ? pm : null;
  };

  if (expr.day) {
    const date = resolveDay(expr.day, today);
    const time = expr.clock ? clockTime(expr.clock, expr.part) : expr.part ? PART_TIME[expr.part] : null;
    if (time === null) {
      if (date === today) return { ok: true, at: nextSlot(new Date(now.getTime() + 30 * 60_000), timeZone) };
      return { ok: true, at: onDayAt(date, MORNING, timeZone) };
    }
    const at = onDayAt(date, time, timeZone);
    if (future(at)) return { ok: true, at };
    if (date !== today) return { ok: false, error: "Ten termin już minął." };
    // „w piątek” w piątek po godzinie = za tydzień; „dziś o 5” po 5:00 = 17:00.
    if (expr.day.kind === "weekday") return { ok: true, at: onDayAt(addDays(date, 7), time, timeZone) };
    const pm = afternoonVariant(date);
    return pm ? { ok: true, at: pm } : { ok: false, error: "Ta godzina dziś już minęła." };
  }

  if (expr.clock) {
    const at = onDayAt(today, clockTime(expr.clock, expr.part), timeZone);
    if (future(at)) return { ok: true, at };
    const pm = afternoonVariant(today);
    return { ok: true, at: pm ?? onDayAt(addDays(today, 1), clockTime(expr.clock, expr.part), timeZone) };
  }

  return { ok: true, at: nextAt(PART_TIME[expr.part ?? "morning"], now, timeZone) };
}
