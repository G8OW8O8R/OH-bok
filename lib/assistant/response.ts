import { createReplyGuard } from "./reply";
import { errorEvent, parseWireCommands, type AssistantEvent } from "./schema";

/**
 * Odpowiedź modelu → zdarzenia dla klienta. Model pisze jedną z dwóch form (prompt w `prompt.ts`):
 * `KOMENDY:` + tablica JSON (bufor, walidacja Zod, dopiero całość idzie do klienta) albo zwykły tekst
 * (strumieniowany przez strażnika z `reply.ts`). Treść spoza tych form nie ma innej drogi do klienta.
 */

/** Więcej niż 5 komend w JSON-ie nie zajmie tyle; dłuższy bufor = odpowiedź odrzucona. */
const MAX_COMMANDS_CHARS = 4000;
/** Po tylu znakach (albo końcu linii) wiadomo, czy to komendy, czy tekst. */
const DECIDE_AFTER = 10;

type Mode = "pending" | "text" | "commands";

function decide(buffer: string, final: boolean): Mode {
  const head = buffer.trimStart();
  if (/^KOMENDY\s*:/i.test(head) || /^[[{]/.test(head) || /^```(?:json)?\s*[[{]/i.test(head)) return "commands";
  if (/^```(?:json)?\s*$/i.test(head) && !final) return "pending";
  const undecided = head.length < DECIDE_AFTER && !head.includes("\n") && "KOMENDY:".startsWith(head.toUpperCase());
  return undecided && !final ? "pending" : "text";
}

/** Pierwszy kompletny obiekt/tablica JSON w tekście (z pominięciem nawiasów w napisach). */
export function extractJson(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (inString) {
      if (char === "\\") i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function createResponseProcessor(now: Date) {
  let mode: Mode = "pending";
  let buffer = "";
  let overflow = false;
  const guard = createReplyGuard();

  const text = (delta: string): AssistantEvent[] => (delta ? [{ type: "text", delta }] : []);

  return {
    push(delta: string): AssistantEvent[] {
      if (mode === "text") return text(guard.push(delta));
      buffer += delta;
      if (mode === "commands") {
        if (buffer.length > MAX_COMMANDS_CHARS) overflow = true;
        return [];
      }
      mode = decide(buffer, false);
      if (mode !== "text") return [];
      const pending = buffer;
      buffer = "";
      return text(guard.push(pending));
    },

    finish(): AssistantEvent[] {
      if (mode === "pending") {
        mode = decide(buffer, true);
        if (mode === "text") {
          guard.push(buffer);
          buffer = "";
        }
      }
      if (mode === "commands") {
        const json = overflow ? null : extractJson(buffer.replace(/^\s*KOMENDY\s*:/i, ""));
        let raw: unknown = null;
        try {
          raw = json === null ? null : JSON.parse(json);
        } catch {
          raw = null;
        }
        const { commands } = parseWireCommands(raw, now);
        return commands.length > 0 ? [{ type: "commands", commands }, { type: "done" }] : [errorEvent("invalid"), { type: "done" }];
      }
      const events = text(guard.finish());
      if (guard.text.trim() === "") return [errorEvent("invalid"), { type: "done" }];
      return [...events, { type: "done" }];
    },

    /** Dalszy tekst modelu niczego nie zmieni (limit zdań, kod) – można przerwać strumień. */
    get stopped(): boolean {
      return mode === "text" && guard.stopped;
    },
  };
}
