import { unstable_cache } from "next/cache";
import { providersFromEnv } from "@/lib/assistant/providers";
import { getHeadlines, type HeadlinesResult } from "./service";
import { generateSummary } from "./summary";
import type { NewsSummary } from "./schema";

/**
 * Wiadomości ze streszczeniem: streszczenie generowane najwyżej raz na godzinę
 * i wspólne dla wszystkich – kluczem cache danych Next.js jest bieżąca godzina (UTC), więc
 * każda instancja i każdy użytkownik w tej godzinie dostaje ten sam wpis. Nieudana próba
 * niczego nie zapisuje; ta instancja wstrzymuje kolejne na 5 min (limit dostawców).
 */

export const SUMMARY_REVALIDATE_S = 60 * 60;
const FAILURE_PAUSE_MS = 5 * 60 * 1000;

const cachedSummary = unstable_cache(
  async (hour: string): Promise<NewsSummary> => {
    const { digest } = await getHeadlines();
    if (digest.demo) throw new Error(`brak prawdziwych nagłówków (${hour})`);
    return generateSummary(digest.categories, providersFromEnv(process.env));
  },
  ["news-summary-v5"],
  { revalidate: SUMMARY_REVALIDATE_S, tags: ["news-summary"] },
);

const inflight = new Map<string, Promise<NewsSummary>>();
let failedAt = 0;

function summaryTask(hour: string): Promise<NewsSummary> {
  const running = inflight.get(hour);
  if (running) return running;
  const task = cachedSummary(hour)
    .catch((error: unknown) => {
      failedAt = Date.now();
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[news] streszczenie niedostępne: ${reason}`);
      throw error;
    })
    .finally(() => inflight.delete(hour));
  inflight.set(hour, task);
  return task;
}

export interface NewsDigestResult extends HeadlinesResult {
  /** Streszczenie jeszcze się generuje: route dokańcza je w tle (`after`). */
  pending: Promise<unknown> | null;
}

/** Nagłówki + streszczenie, jeśli gotowe w ciągu `waitMs`. */
export async function getNewsDigest(waitMs: number): Promise<NewsDigestResult> {
  const result = await getHeadlines();
  const aiReady = providersFromEnv(process.env).length > 0;
  if (result.digest.demo || !aiReady || Date.now() - failedAt < FAILURE_PAUSE_MS) return { ...result, pending: null };

  const hour = new Date().toISOString().slice(0, 13);
  const task = summaryTask(hour);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const summary = await Promise.race([task.catch(() => null), timeout]);
  clearTimeout(timer);
  if (summary) return { ...result, digest: { ...result.digest, summary }, pending: null };
  const stillRunning = inflight.has(hour);
  return {
    ...result,
    digest: { ...result.digest, summaryPending: stillRunning },
    pending: stillRunning ? task.catch(() => undefined) : null,
  };
}
