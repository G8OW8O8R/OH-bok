import type { Quote } from "@/lib/markets/schema";
import { assistantRequestSchema } from "./context";
import { buildPrompt } from "./prompt";
import { AllProvidersFailed, openStream, type ProviderConfig, type ProviderStream } from "./providers";
import { checkRateLimit, type CounterStore } from "./rate-limit";
import { createResponseProcessor } from "./response";
import { errorEvent, type AssistantErrorCode, type AssistantEvent, type ProviderId } from "./schema";

/**
 * Logika `/api/assistant` bez Next.js (testy na podstawionych dostawcach): walidacja, limit,
 * dostawca z failoverem, odpowiedź modelu → zdarzenia NDJSON.
 */

/** Cała odpowiedź modelu (po pierwszym fragmencie) maks. tyle – potem przerwanie. */
export const TOTAL_TIMEOUT_MS = 20_000;

export interface AssistantDeps {
  providers: readonly ProviderConfig[];
  counters: CounterStore;
  /** Liczniki zapasowe, gdy Upstash nie odpowiada. */
  fallbackCounters?: CounterStore;
  quotes: () => Promise<readonly Quote[]>;
  fetch?: typeof fetch;
  now?: () => Date;
  firstChunkTimeoutMs?: number;
  totalTimeoutMs?: number;
  log?: (message: string) => void;
}

export type AssistantResult =
  | { ok: false; status: number; code: AssistantErrorCode; retryAfterS?: number }
  | { ok: true; provider: ProviderId; events: AsyncGenerator<AssistantEvent> };

const STATUS: Record<AssistantErrorCode, number> = { "bad-request": 400, limit: 429, unavailable: 503, invalid: 502, failed: 502 };

function fail(code: AssistantErrorCode, retryAfterS?: number): AssistantResult {
  return { ok: false, status: STATUS[code], code, retryAfterS };
}

export async function runAssistant(body: unknown, ip: string, deps: AssistantDeps, signal?: AbortSignal): Promise<AssistantResult> {
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) return fail("bad-request");
  if (deps.providers.length === 0) return fail("unavailable");

  const now = deps.now?.() ?? new Date();
  const limit = await checkRateLimit(deps.counters, ip, now, deps.fallbackCounters);
  if (!limit.ok) return fail("limit", limit.retryAfterS);

  const quotes = await deps.quotes().catch(() => []);
  const prompt = buildPrompt(parsed.data.query, parsed.data.context, quotes, now);
  let stream: ProviderStream;
  try {
    stream = await openStream(deps.providers, prompt, { fetch: deps.fetch, firstChunkTimeoutMs: deps.firstChunkTimeoutMs, signal });
  } catch (error) {
    if (error instanceof AllProvidersFailed) {
      deps.log?.(`asystent: brak odpowiedzi (${error.message})`);
      return fail(error.limited ? "limit" : "unavailable");
    }
    throw error;
  }
  if (stream.failures.length > 0) deps.log?.(`asystent: przełączono na ${stream.provider} (${stream.failures.map((f) => f.message).join("; ")})`);
  return { ok: true, provider: stream.provider, events: assistantEvents(stream, now, deps.totalTimeoutMs ?? TOTAL_TIMEOUT_MS) };
}

async function* assistantEvents(stream: ProviderStream, now: Date, totalTimeoutMs: number): AsyncGenerator<AssistantEvent> {
  const processor = createResponseProcessor(now);
  const timer = setTimeout(stream.abort, totalTimeoutMs);
  yield { type: "provider", provider: stream.provider };
  try {
    yield* processor.push(stream.first);
    while (!processor.stopped) {
      const next = await stream.rest.next();
      if (next.done) break;
      yield* processor.push(next.value);
    }
    if (processor.stopped) stream.abort();
  } catch {
    // Zerwany strumień albo limit czasu: to, co już poszło, zostaje u klienta; dalej tylko komunikat.
    yield* processor.finish().filter((event) => event.type === "text");
    yield errorEvent("failed");
    yield { type: "done" };
    return;
  } finally {
    clearTimeout(timer);
  }
  yield* processor.finish();
}

/**
 * Zdarzenia → strumień NDJSON (jedna linia JSON na zdarzenie). Rozłączenie klienta przerywa zapytanie
 * do dostawcy przez `signal` żądania (przekazany do `openStream`).
 */
export function toNdjsonStream(events: AsyncGenerator<AssistantEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch {
        controller.enqueue(encoder.encode(`${JSON.stringify(errorEvent("failed"))}\n`));
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });
}
