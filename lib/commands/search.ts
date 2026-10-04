import { addDays } from "@/lib/calendar";
import { dateIn, formatTime, weekdayLong } from "@/lib/time";
import { APP_IDS, APPS, type AppId } from "@/lib/windows/apps";
import type { Command } from "./parse";
import { cleanInput, fold } from "./text";

/** Słowa, po których znajduje się aplikację (nazwa, adres, potoczne określenia). */
const APP_KEYWORDS: Record<AppId, readonly string[]> = {
  weather: ["pogoda", "prognoza"],
  shopping: ["lista zakupów", "zakupy"],
  reminders: ["przypomnienia"],
  markets: ["rynki", "kryptowaluty", "krypto", "giełda", "kursy"],
};

/**
 * Wyszukiwanie aplikacji po nazwie: każde słowo zapytania musi być początkiem
 * któregoś słowa nazwy, bez wielkości liter i polskich znaków („ryn” → Rynki, „lis zak” → Lista zakupów).
 */
export function searchApps(query: string): AppId[] {
  const words = fold(cleanInput(query)).split(" ").filter(Boolean);
  if (words.length === 0 || words.join("").length < 2) return [];
  return APP_IDS.filter((id) => {
    const names = [APPS[id].title, APPS[id].slug, ...APP_KEYWORDS[id]].map((name) => fold(name).split(/\s+/));
    return names.some((nameWords) => words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word))));
  });
}

/** Przykłady w pustym Spotlighcie (klik wpisuje komendę, wykonanie nadal wymaga Enter). */
export const EXAMPLE_COMMANDS = [
  "przypomnij mi jutro o 9 o dentyście",
  "dodaj mleko i jajka",
  "ile kosztuje bitcoin",
  "jaka pogoda jutro",
] as const;

/** Podpowiedzi, gdy parser nie rozumie (w zadaniu 8 to miejsce przejmie asystent AI). */
export const FALLBACK_EXAMPLES = ["za 15 minut wyjąć pranie", "pokaż czwartek", "otwórz rynki"] as const;

/** Termin w wierszu wyniku: `dziś, 14:30`, `jutro, 09:00`, `piątek, 14:30`, dalej `12.10, 09:00`. */
export function formatCommandWhen(at: Date, now: Date, timeZone: string): string {
  const today = dateIn(now, timeZone);
  const day = dateIn(at, timeZone);
  const time = formatTime(at, timeZone);
  if (day === today) return `dziś, ${time}`;
  if (day === addDays(today, 1)) return `jutro, ${time}`;
  if (day === addDays(today, 2)) return `pojutrze, ${time}`;
  for (let offset = 3; offset < 7; offset += 1) {
    if (day === addDays(today, offset)) return `${weekdayLong(day).toLocaleLowerCase("pl")}, ${time}`;
  }
  const [, month = "", dayOfMonth = ""] = day.split("-");
  return `${dayOfMonth}.${month}, ${time}`;
}

/** Komendy, które coś zmieniają (wykonanie Enterem, chipy postępu, „Cofnij”). */
export type ActionCommand =
  | Extract<Command, { kind: "addItems" | "removeItem" | "reminder" | "alert" | "openApp" }>
  | (Extract<Command, { kind: "weather" }> & { pin: true });

const ACTION_KINDS: readonly Command["kind"][] = ["addItems", "removeItem", "reminder", "alert", "openApp"];

export function isAction(command: Command): command is ActionCommand {
  if (command.kind === "weather") return command.pin;
  return ACTION_KINDS.includes(command.kind);
}

/** Środkowy chip postępu („Rozumiem polecenie ✓” → ten → „Gotowe ✓”). */
export function progressLabel(command: ActionCommand): string {
  switch (command.kind) {
    case "reminder":
      return "Tworzę przypomnienie…";
    case "addItems":
      return "Dopisuję do listy…";
    case "removeItem":
      return "Usuwam z listy…";
    case "alert":
      return "Ustawiam alert…";
    case "openApp":
      return `Otwieram: ${APPS[command.app].title}…`;
    case "weather":
      return "Zmieniam scenę…";
  }
}
