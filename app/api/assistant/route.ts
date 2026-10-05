import { NextResponse } from "next/server";
import { providersFromEnv } from "@/lib/assistant/providers";
import { clientIp, memoryCounterStore, upstashCounterStore, type CounterStore } from "@/lib/assistant/rate-limit";
import { errorEvent } from "@/lib/assistant/schema";
import { runAssistant, toNdjsonStream } from "@/lib/assistant/service";
import { getQuotes } from "@/lib/markets/service";

/** Pierwszy fragment do 8 s na dostawcę, cała odpowiedź do 20 s. */
export const maxDuration = 45;

/** Pamięć instancji: liczniki bez Upstash albo przy jego awarii. */
const memoryCounters = memoryCounterStore();

function counters(): CounterStore {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? upstashCounterStore(url, token) : memoryCounters;
}

/**
 * POST /api/assistant — asystent AI. Wejście: `{ query, context }` (Zod).
 * Wyjście: NDJSON ze zdarzeniami (`provider`, `text`, `commands`, `done`, `error`) albo błąd JSON
 * (400 / 429 / 503) z przyjaznym komunikatem. Nagłówek `x-obok-provider`. Klucze tylko w env serwera.
 */
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await runAssistant(body, clientIp(request.headers), {
    providers: providersFromEnv(process.env),
    counters: counters(),
    fallbackCounters: memoryCounters,
    quotes: async () => (await getQuotes()).data.quotes,
    log: (message) => console.warn(message),
  }, request.signal);

  if (!result.ok) {
    return NextResponse.json(errorEvent(result.code), {
      status: result.status,
      headers: {
        "cache-control": "no-store",
        ...(result.retryAfterS ? { "retry-after": String(result.retryAfterS) } : {}),
      },
    });
  }

  return new Response(toNdjsonStream(result.events), {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-obok-provider": result.provider,
      "x-accel-buffering": "no",
    },
  });
}
