import { z } from "zod";
import { ALERT_CONDITIONS } from "@/lib/markets/alerts";
import { currencySchema, type Currency } from "@/lib/markets/currency";
import { marketSymbolSchema } from "@/lib/markets/schema";
import type { MarketSymbol } from "@/lib/markets/symbols";
import { MAX_TITLE } from "@/lib/reminders/reminders";
import { todayIn } from "@/lib/reminders/when";
import { MAX_ITEM_NAME } from "@/lib/shopping/list";
import { appIdSchema, type AppId } from "@/lib/windows/apps";
import { resolveDay, resolveTime, takeDay, takeTime } from "./dates";
import { capitalize, cleanInput, fold, Phrase } from "./text";

/**
 * Lokalny parser komend: najczęstsze polecenia po polsku bez AI. Wynik to dane
 * (te same kształty zwraca asystent AI – `lib/assistant/schema.ts`), wykonuje je Spotlight.
 */
export const addItemsCommandSchema = z.object({ kind: z.literal("addItems"), items: z.array(z.string().trim().min(1).max(MAX_ITEM_NAME)).min(1) });
export const removeItemCommandSchema = z.object({ kind: z.literal("removeItem"), item: z.string().trim().min(1).max(MAX_ITEM_NAME) });
export const reminderCommandSchema = z.object({ kind: z.literal("reminder"), title: z.string().trim().min(1).max(MAX_TITLE), at: z.date() });
export const openAppCommandSchema = z.object({ kind: z.literal("openApp"), app: appIdSchema });
export const priceCommandSchema = z.object({ kind: z.literal("price"), symbol: marketSymbolSchema });
export const alertCommandSchema = z.object({
  kind: z.literal("alert"),
  symbol: marketSymbolSchema,
  condition: z.enum(ALERT_CONDITIONS),
  threshold: z.number().positive(),
  /** null = waluta wyświetlania w oknie Rynków. */
  currency: currencySchema.nullable(),
});
/** Prognoza dnia; `pin` = przypięcie dnia na pulpicie („pokaż czwartek”). */
export const weatherCommandSchema = z.object({ kind: z.literal("weather"), date: z.iso.date(), pin: z.boolean() });
/** Odtwarzacz: `calm` = „coś spokojnego” (spokojna kolejka i od razu gra). */
export const MUSIC_ACTIONS = ["play", "pause", "next", "calm"] as const;
export const musicCommandSchema = z.object({ kind: z.literal("music"), action: z.enum(MUSIC_ACTIONS) });

export const commandSchema = z.discriminatedUnion("kind", [
  addItemsCommandSchema,
  removeItemCommandSchema,
  reminderCommandSchema,
  openAppCommandSchema,
  priceCommandSchema,
  alertCommandSchema,
  weatherCommandSchema,
  musicCommandSchema,
  /** Zrozumiany zamiar bez kompletu danych: podpowiedź zamiast zgadywania. */
  z.object({ kind: z.literal("incomplete"), intent: z.enum(["reminder", "alert"]), message: z.string() }),
  z.object({ kind: z.literal("unknown") }),
]);

export type Command = z.infer<typeof commandSchema>;

export interface ParseContext {
  now: Date;
  /** Strefa użytkownika (terminy przypomnień, „dziś”). */
  timeZone: string;
}

const SYMBOL_ALIASES: [RegExp, MarketSymbol][] = [
  [/\b(bitcoin\w*|btc)\b/, "BTC"],
  [/\b(ethereum\w*|etherum\w*|ether\w*|eth|eter\w*)\b/, "ETH"],
  [/\b(solan\w*|sol)\b/, "SOL"],
  [/\b(xrp|ripple\w*)\b/, "XRP"],
  [/\b(cardano\w*|ada)\b/, "ADA"],
];

function findSymbol(key: string): { symbol: MarketSymbol; word: string } | null {
  for (const [pattern, symbol] of SYMBOL_ALIASES) {
    const match = pattern.exec(key);
    if (match) return { symbol, word: match[1] ?? "" };
  }
  return null;
}

const ALERT_INTENT = /\b(powiadom|zawiadom|daj(?:\s+mi)?\s+znac|alert|ostrzez|poinformuj|informuj)/;
const BELOW = /\b(ponizej|spadnie|spadna|zejdzie|mniej\s+niz|tansz)/;
const ABOVE = /\b(powyzej|ponad|przekroczy|wzrosnie|urosnie|przebije|wiecej\s+niz|drozsz|dojdzie\s+do)/;
const AMOUNT =
  /(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d+))?\s*(tys\.?|tysiecy|tysiace|k)?\s*(zl\w*|pln|\$|usd|dolar\w*)?(?![\w])/;

function parseAlert(key: string): Command | null {
  const symbol = findSymbol(key);
  const condition = BELOW.test(key) ? "below" : ABOVE.test(key) ? "above" : null;
  const amount = AMOUNT.exec(key);
  const intent = ALERT_INTENT.test(key);
  if (!intent && !(symbol && condition && amount)) return null;
  if (!symbol || !condition || !amount) {
    if (!symbol && !condition) return null;
    return { kind: "incomplete", intent: "alert", message: "Podaj kryptowalutę i próg, np. „gdy BTC spadnie poniżej 60 000”." };
  }
  const whole = Number((amount[1] ?? "").replace(/[  ]/g, ""));
  const fraction = amount[2] ? Number(`0.${amount[2]}`) : 0;
  const threshold = (whole + fraction) * (amount[3] ? 1000 : 1);
  const unit = amount[4] ?? "";
  const currency: Currency | null = /^(zl|pln)/.test(unit) ? "PLN" : unit ? "USD" : null;
  if (!(threshold > 0)) return null;
  return { kind: "alert", symbol: symbol.symbol, condition, threshold, currency };
}

const PRICE_INTENT = /\b(ile\s+(?:kosztuj\w*|jest\s+wart\w*|za)|po\s+ile|cen[aey]|kurs|notowani\w*|wycen\w*)\b/;

function parsePrice(key: string): Command | null {
  const symbol = findSymbol(key);
  if (!symbol) return null;
  // Samo „sól” albo „Ada” to raczej zakupy albo imię – tylko z pytaniem o cenę.
  const bare = key.trim() === symbol.word && symbol.word !== "sol" && symbol.word !== "ada";
  return PRICE_INTENT.test(key) || bare ? { kind: "price", symbol: symbol.symbol } : null;
}

const WEATHER_INTENT = /\b(pogod\w*|prognoz\w*|padac|pada|padal|deszcz\w*|temperatur\w*|stopni|cieplo|zimno|slonecznie)\b/;
const PIN_VERB = /^(?:pokaz|przelacz(?:\s+sie)?\s+na|przejdz\s+do|ustaw)\s+(?:(?:mi\s+)?pogode\s+)?/;

function parseWeather(text: string, today: string): Command | null {
  const pin = PIN_VERB.exec(fold(text));
  if (pin) {
    const phrase = new Phrase(text.slice(pin[0].length));
    const day = takeDay(phrase, true);
    if (day && phrase.rest() === "") return { kind: "weather", date: resolveDay(day, today), pin: true };
  }
  const phrase = new Phrase(text);
  if (!WEATHER_INTENT.test(phrase.key)) return null;
  const day = takeDay(phrase, true);
  // Samo „pogoda” otwiera aplikację.
  if (!day && /^\s*(pogod\w*|prognoz\w*)\s*$/.test(phrase.key)) return null;
  return { kind: "weather", date: day ? resolveDay(day, today) : today, pin: false };
}

const MUSIC_NOUN = String.raw`(?:muzyk[aeiy]|muzyczk[aeiy]|piosenk[aeiy]|utwor|kawalek|playlist[aeiy]|odtwarzanie|odtwarzacz)`;
const MUSIC_CALM = /^(?:(?:wlacz|pusc|zagraj|daj|graj)\s+(?:mi\s+)?)?(?:cos\s+(?:spokojn\w*|na\s+relaks|do\s+relaksu|wyciszajac\w*|lagodn\w*)|spokojn\w*(?:\s+muzyk\w*)?|muzyk\w*\s+(?:spokojn\w*|do\s+relaksu|na\s+relaks)|relaks\w*)$/;
const MUSIC_PAUSE = new RegExp(String.raw`^(?:pauza|zapauzuj|stop|zatrzymaj|wstrzymaj|wylacz|wycisz|przestan\s+grac|cisza)(?:\s+${MUSIC_NOUN})?$`);
const MUSIC_NEXT = new RegExp(String.raw`^(?:(?:nastepn\w*|kolejn\w*)(?:\s+${MUSIC_NOUN})?|inn\w*\s+${MUSIC_NOUN}|(?:pomin|przewin)(?:\s+${MUSIC_NOUN})?|(?:zmien|przelacz)\s+(?:na\s+)?(?:nastepn\w*\s+|inn\w*\s+)?${MUSIC_NOUN}|dalej|skip)$`);
const MUSIC_PLAY = new RegExp(String.raw`^(?:(?:wlacz|pusc|zagraj|odtworz|graj|wznow|daj)(?:\s+(?:mi|nam))?(?:\s+(?:jakas|troche|cos))?\s+${MUSIC_NOUN}|(?:graj|wznow|play)|${MUSIC_NOUN})$`);

/**
 * Odtwarzacz: „włącz muzykę”, „coś spokojnego”, „pauza”, „następny”. Tylko całe, krótkie polecenia
 * („stop” w środku zdania to nie pauza); same „pauza”, „stop”, „dalej” zawsze dotyczą muzyki.
 */
function parseMusic(key: string): Command | null {
  const text = key.replace(/^(?:prosze\s+)?/, "").replace(/\s+prosze$/, "").trim();
  if (MUSIC_CALM.test(text)) return { kind: "music", action: "calm" };
  if (MUSIC_PAUSE.test(text)) return { kind: "music", action: "pause" };
  if (MUSIC_NEXT.test(text)) return { kind: "music", action: "next" };
  if (MUSIC_PLAY.test(text)) return { kind: "music", action: "play" };
  return null;
}

const LIST_SUFFIX = /\s+(?:do|na)\s+(?:listy|liste|zakupow|koszyka)(?:\s+zakupow)?\s*$/;

function splitItems(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+(?:i|oraz|a\s+takze)\s+/u)
    .map((item) => item.trim().replace(/^(?:jeszcze|tez)\s+/iu, ""))
    .filter((item) => item.length > 0)
    .map((item) => capitalize(item).slice(0, MAX_ITEM_NAME));
}

const NOT_AN_ITEM = /^(?:skladnik\w*|przypomnij|ustaw|otworz|pokaz|powiadom|usun|sprawdz)\b/;

function parseShopping(text: string): Command | null {
  const key = fold(text);
  const add = /^(?:dodaj|dopisz|kup|wpisz)\s+(?:do\s+(?:listy|zakupow)\s+)?/.exec(key);
  if (add && !/^(przypomnien|alert)/.test(key.slice(add[0].length))) {
    const body = text.slice(add[0].length);
    const suffix = LIST_SUFFIX.exec(fold(body));
    const items = splitItems(suffix ? body.slice(0, suffix.index) : body);
    // „Składniki na naleśniki” i polecenie w środku („…i przypomnij mi o 18”) to zadanie dla asystenta AI.
    if (items.some((item) => NOT_AN_ITEM.test(fold(item)))) return null;
    return items.length > 0 ? { kind: "addItems", items } : null;
  }
  const remove = /^(?:usun|skresl|wykresl|wyrzuc|odhacz)\s+/.exec(key);
  if (remove && !/^(przypomnien|alert)/.test(key.slice(remove[0].length))) {
    const body = text.slice(remove[0].length);
    const suffix = /\s+(?:z|ze)\s+(?:listy|zakupow|koszyka)(?:\s+zakupow)?\s*$/.exec(fold(body));
    const item = (suffix ? body.slice(0, suffix.index) : body).trim();
    return item ? { kind: "removeItem", item: capitalize(item).slice(0, MAX_ITEM_NAME) } : null;
  }
  return null;
}

const APP_WORDS: [RegExp, AppId][] = [
  [/^(pogod[aey]|prognoz[aey])$/, "weather"],
  [/^(list[aey](?:\s+zakupow)?|zakupy)$/, "shopping"],
  [/^(przypomnieni[ae]|przypominajk[ai])$/, "reminders"],
  [/^(rynk[iu]|rynek|krypto(?:waluty)?|gield[aey])$/, "markets"],
  [/^(wiadomosci|newsy|aktualnosci)$/, "news"],
  [/^(?:informacje\s+)?o\s+systemie$|^informacje$/, "about"],
];

function parseOpenApp(key: string): Command | null {
  const body = key.replace(/^(?:otworz|pokaz|uruchom|wlacz|przejdz\s+do)\s+(?:aplikacje\s+)?/, "").trim();
  for (const [pattern, app] of APP_WORDS) if (pattern.test(body)) return { kind: "openApp", app };
  return null;
}

/** Miejscownik po „o” → mianownik w tytule („o dentyście” → „Dentysta”, jak na makiecie). */
const LOCATIVE: Record<string, string> = {
  dentyscie: "dentysta",
  lekarzu: "lekarz",
  fryzjerze: "fryzjer",
  weterynarzu: "weterynarz",
  mechaniku: "mechanik",
  spotkaniu: "spotkanie",
  zebraniu: "zebranie",
  urodzinach: "urodziny",
  imieninach: "imieniny",
  rachunkach: "rachunki",
  rachunku: "rachunek",
  oplatach: "opłaty",
  czynszu: "czynsz",
  lekach: "leki",
  tabletkach: "tabletki",
  treningu: "trening",
  silowni: "siłownia",
  basenie: "basen",
  wizycie: "wizyta",
  paczce: "paczka",
  praniu: "pranie",
  zakupach: "zakupy",
  kolacji: "kolacja",
  obiedzie: "obiad",
  egzaminie: "egzamin",
  rozmowie: "rozmowa",
  prezencie: "prezent",
  kwiatach: "kwiaty",
  telefonie: "telefon",
};

/** Tytuł przypomnienia z reszty komendy (bez wyrażenia czasu i bez „przypomnij mi”). */
export function reminderTitle(rest: string): string {
  let text = rest
    .replace(/^[\s,:–-]+|[\s,:–-]+$/gu, "")
    .replace(/^(?:mi|nam)\s+/iu, "")
    .trim();
  const key = fold(text);
  const connector = /^(?:o\s+tym,?\s+(?:ze|zeby|aby)|ze|zeby|zebym|aby|abym|bym)\s+/.exec(key);
  if (connector) text = text.slice(connector[0].length);
  else if (/^o\s+/.test(key)) {
    const body = text.replace(/^o\s+/iu, "");
    const [first = "", ...others] = body.split(" ");
    const lemma = LOCATIVE[fold(first)];
    text = lemma ? [lemma, ...others].join(" ") : `pamiętać o ${body}`;
  }
  return capitalize(text.trim()).slice(0, MAX_TITLE).trim();
}

const REMINDER_PREFIX = /^(?:przypomnij(?:\s+mi)?|przypomnienie|(?:dodaj|ustaw|utworz)\s+przypomnienie)\b/;

function parseReminder(text: string, ctx: ParseContext, explicit: boolean): Command | null {
  const prefix = REMINDER_PREFIX.exec(fold(text));
  if (explicit !== Boolean(prefix)) return null;
  const phrase = new Phrase(prefix ? text.slice(prefix[0].length) : text);
  const expr = takeTime(phrase);
  // Bez „przypomnij” przypomnienie rozpoznajemy tylko, gdy komenda zaczyna się od terminu.
  if (!prefix && !expr?.leading) return null;
  const title = reminderTitle(phrase.rest());
  if (!expr) return { kind: "incomplete", intent: "reminder", message: "Kiedy przypomnieć? Np. „jutro o 9” albo „za 15 minut”." };
  if (!title) return prefix ? { kind: "incomplete", intent: "reminder", message: "O czym przypomnieć?" } : null;
  const resolved = resolveTime(expr, ctx.now, ctx.timeZone);
  if (!resolved.ok) return { kind: "incomplete", intent: "reminder", message: resolved.error };
  return { kind: "reminder", title, at: resolved.at };
}

/** Komenda z tekstu. Kolejność rozstrzyga niejednoznaczności („jaka pogoda jutro” to pogoda, nie przypomnienie). */
export function parseCommand(input: string, ctx: ParseContext): Command {
  const text = cleanInput(input);
  if (!text) return { kind: "unknown" };
  const key = fold(text);
  const today = todayIn(ctx.now, ctx.timeZone);
  return (
    parseMusic(key) ??
    parseAlert(key) ??
    parsePrice(key) ??
    parseReminder(text, ctx, true) ??
    parseWeather(text, today) ??
    parseShopping(text) ??
    parseOpenApp(key) ??
    parseReminder(text, ctx, false) ?? { kind: "unknown" }
  );
}
