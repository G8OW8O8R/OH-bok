import type { AssistantRequest } from "./context";
import {
  ASSISTANT_ERROR_MESSAGES,
  assistantEventSchema,
  errorEvent,
  parseWireCommands,
  providerIdSchema,
  toCommand,
  type AssistantCommand,
  type AssistantErrorEvent,
  type ProviderId,
} from "./schema";

/**
 * Klient `/api/assistant`: czyta NDJSON i waliduje każde zdarzenie drugi raz (Zod) – zła linia odpada.
 * Komendy przechodzą przez ten sam schemat co z parsera, termin liczony względem zegara klienta.
 */

export type ClientEvent =
  | { type: "provider"; provider: ProviderId }
  | { type: "text"; delta: string }
  | { type: "commands"; commands: AssistantCommand[] }
  | { type: "done" }
  | AssistantErrorEvent;

/** Zdarzenie z serwera → zdarzenie dla UI (komendy po walidacji; żadna poprawna = błąd). */
export function toClientEvent(raw: unknown, now: Date): ClientEvent | null {
  const parsed = assistantEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const event = parsed.data;
  if (event.type !== "commands") return event;
  const commands = parseWireCommands(event.commands, now)
    .commands.map((wire) => toCommand(wire, now))
    .filter((command) => command !== null);
  return commands.length > 0 ? { type: "commands", commands } : errorEvent("invalid");
}

export async function askAssistant(request: AssistantRequest, onEvent: (event: ClientEvent) => void, signal: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    onEvent(errorEvent("unavailable"));
    return;
  }

  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    const event = toClientEvent(body, new Date());
    onEvent(event?.type === "error" ? event : errorEvent(response.status === 429 ? "limit" : "unavailable"));
    return;
  }

  const header = providerIdSchema.safeParse(response.headers.get("x-obok-provider"));
  if (header.success) onEvent({ type: "provider", provider: header.data });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const event = toClientEvent(raw, new Date());
      if (!event) continue;
      if (event.type === "done") finished = true;
      onEvent(event);
    }
    if (done) break;
  }
  if (!finished) onEvent({ type: "error", code: "failed", message: ASSISTANT_ERROR_MESSAGES.failed });
}
