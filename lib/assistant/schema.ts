import { z } from "zod";
import {
  addItemsCommandSchema,
  alertCommandSchema,
  openAppCommandSchema,
  priceCommandSchema,
  reminderCommandSchema,
  removeItemCommandSchema,
  weatherCommandSchema,
  type Command,
} from "@/lib/commands/parse";
import { currencySchema } from "@/lib/markets/currency";

/**
 * Asystent AI: model nie dostaje nowych uprawnień. Zwraca wyłącznie komendy z unii
 * parsera (te same schematy, tu w wersji „na łączu”: termin jako ISO zamiast `Date`) albo krótki tekst.
 * Walidacja na serwerze (odpowiedź modelu) i drugi raz w kliencie (zdarzenia z `/api/assistant`).
 */

export const MAX_COMMANDS = 5;
export const MAX_ITEMS_PER_COMMAND = 12;
/** Przypomnienie najwyżej rok naprzód i nie w przeszłości (minuta zapasu na drogę przez sieć). */
const REMINDER_PAST_MS = 60_000;
const REMINDER_FUTURE_MS = 366 * 24 * 60 * 60_000;

export const wireCommandSchema = z.discriminatedUnion("kind", [
  addItemsCommandSchema.extend({ items: addItemsCommandSchema.shape.items.max(MAX_ITEMS_PER_COMMAND) }),
  removeItemCommandSchema,
  reminderCommandSchema.extend({ at: z.iso.datetime({ offset: true }) }),
  openAppCommandSchema,
  priceCommandSchema,
  alertCommandSchema.extend({ currency: currencySchema.nullable().default(null) }),
  weatherCommandSchema.extend({ pin: z.boolean().default(false) }),
]);

export type WireCommand = z.infer<typeof wireCommandSchema>;
/** Komenda z asystenta: jak z parsera, bez `incomplete` i `unknown`. */
export type AssistantCommand = Exclude<Command, { kind: "incomplete" | "unknown" }>;

/** Komenda na łączu → komenda Spotlightu (null = termin poza dozwolonym zakresem). */
export function toCommand(wire: WireCommand, now: Date): AssistantCommand | null {
  if (wire.kind !== "reminder") return wire;
  const at = new Date(wire.at);
  const delta = at.getTime() - now.getTime();
  if (!(delta >= -REMINDER_PAST_MS && delta <= REMINDER_FUTURE_MS)) return null;
  return { kind: "reminder", title: wire.title, at };
}

/**
 * Lista komend z surowego JSON-a modelu: tablica, `{ commands: [...] }` albo pojedynczy obiekt.
 * Każda komenda walidowana osobno – zła odpada, reszta zostaje; ponad limit odpada.
 */
export function parseWireCommands(raw: unknown, now: Date): { commands: WireCommand[]; rejected: number } {
  const list: unknown[] =
    Array.isArray(raw) ? raw
    : raw !== null && typeof raw === "object" && "commands" in raw && Array.isArray(raw.commands) ? raw.commands
    : raw !== null && typeof raw === "object" ? [raw]
    : [];
  const commands: WireCommand[] = [];
  let rejected = 0;
  for (const entry of list) {
    const parsed = wireCommandSchema.safeParse(entry);
    if (!parsed.success || commands.length >= MAX_COMMANDS || toCommand(parsed.data, now) === null) {
      rejected += 1;
      continue;
    }
    commands.push(parsed.data);
  }
  return { commands, rejected };
}

export const PROVIDER_IDS = ["groq", "gemini", "cloudflare"] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  groq: "Groq",
  gemini: "Gemini",
  cloudflare: "Cloudflare Workers AI",
};

export const ASSISTANT_ERROR_CODES = ["limit", "unavailable", "invalid", "failed", "bad-request"] as const;
export const assistantErrorCodeSchema = z.enum(ASSISTANT_ERROR_CODES);
export type AssistantErrorCode = z.infer<typeof assistantErrorCodeSchema>;

/** Komunikaty dla użytkownika: parser działa dalej, więc zawsze z propozycją przykładów. */
export const ASSISTANT_ERROR_MESSAGES: Record<AssistantErrorCode, string> = {
  limit: "Asystent odpoczywa – limit pytań na teraz się wyczerpał. Polecenia z przykładów działają dalej.",
  unavailable: "Asystent AI jest teraz niedostępny. Polecenia z przykładów działają dalej.",
  invalid: "Nie udało mi się tego zrozumieć. Spróbuj inaczej albo skorzystaj z przykładów.",
  failed: "Odpowiedź urwała się po drodze. Spróbuj jeszcze raz.",
  "bad-request": "Tego pytania nie da się wysłać – jest za długie albo puste.",
};

export const MAX_REPLY_CHARS = 500;

/** Zdarzenia strumienia NDJSON z `/api/assistant`. */
export const assistantEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("provider"), provider: providerIdSchema }),
  z.object({ type: z.literal("text"), delta: z.string().max(MAX_REPLY_CHARS) }),
  z.object({ type: z.literal("commands"), commands: z.array(z.unknown()).min(1).max(MAX_COMMANDS) }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), code: assistantErrorCodeSchema, message: z.string().max(300) }),
]);

export type AssistantEvent = z.infer<typeof assistantEventSchema>;

export type AssistantErrorEvent = Extract<AssistantEvent, { type: "error" }>;

export function errorEvent(code: AssistantErrorCode): AssistantErrorEvent {
  return { type: "error", code, message: ASSISTANT_ERROR_MESSAGES[code] };
}
