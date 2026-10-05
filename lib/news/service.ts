import { classifyCacheAge, responseDate, type FreshCacheStatus } from "@/lib/cache-age";
import { createLastKnown, type LastKnown } from "@/lib/markets/service";
import { rankHeadlines } from "./dedupe";
import { demoDigest } from "./demo";
import { normalizeFeed } from "./normalize";
import { decodeFeed, parseFeed } from "./rss";
import { HEADLINES_PER_CATEGORY, type FeedStatus, type Headline, type NewsDigest } from "./schema";
import { NEWS_CATEGORIES, NEWS_SOURCES, type NewsCategory, type NewsSource } from "./sources";

/**
 * Nagłówki po stronie serwera: każdy kanał przez cache danych Next.js (30 min),
 * normalizacja, deduplikacja i ranking. Kanał, który nie odpowiada, bierze ostatnie dane
 * z pamięci instancji; bez żadnych danych – demo. Nigdy nie rzuca wyjątku.
 */

export const NEWS_REVALIDATE_S = 30 * 60;
export const NEWS_CACHE_TAG = "news";
const UPSTREAM_TIMEOUT_MS = 5000;
/** Ostatnie nagłówki kanału z pamięci instancji wolno pokazać najwyżej tyle po pobraniu. */
const LAST_FEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type NewsCacheStatus = FreshCacheStatus | "demo";

export interface NewsServiceDeps {
  fetch: typeof fetch;
  now: () => Date;
  feeds: LastKnown<Headline[]>;
  sources?: readonly NewsSource[];
  onUpstreamError?: (source: string, error: unknown) => void;
}

export const defaultNewsDeps: NewsServiceDeps = {
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  feeds: createLastKnown(LAST_FEED_MAX_AGE_MS),
  onUpstreamError: (source, error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[news] ${source} niedostępne, używam pamięci/demo: ${reason}`);
  },
};

interface FeedResult {
  source: NewsSource;
  headlines: Headline[];
  state: FeedStatus["state"];
  cache: FreshCacheStatus;
}

async function loadFeed(source: NewsSource, deps: NewsServiceDeps): Promise<FeedResult> {
  const started = deps.now();
  try {
    const response = await deps.fetch(source.url, {
      headers: { accept: "application/rss+xml, application/rdf+xml, application/atom+xml, application/xml, text/xml" },
      next: { revalidate: NEWS_REVALIDATE_S, tags: [NEWS_CACHE_TAG] },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fetchedAt = responseDate(response, started);
    const xml = decodeFeed(await response.arrayBuffer(), response.headers.get("content-type"));
    const headlines = normalizeFeed(parseFeed(xml), source, fetchedAt);
    if (headlines.length === 0) throw new Error("brak poprawnych pozycji");
    deps.feeds.set(source.id, headlines, fetchedAt);
    return { source, headlines, state: "live", cache: classifyCacheAge(started.getTime() - fetchedAt.getTime(), NEWS_REVALIDATE_S) };
  } catch (error) {
    deps.onUpstreamError?.(source.name, error);
    const last = deps.feeds.get(source.id, started);
    return { source, headlines: last ?? [], state: last ? "stale" : "down", cache: "stale" };
  }
}

/** Status całości: dane z pamięci instancji = stale; inaczej najstarszy kanał rozstrzyga. */
function overallCache(results: readonly FeedResult[]): FreshCacheStatus {
  const used = results.filter((result) => result.state !== "down");
  if (used.some((result) => result.cache === "stale")) return "stale";
  if (used.some((result) => result.cache === "hit")) return "hit";
  return "miss";
}

export interface HeadlinesResult {
  digest: NewsDigest;
  cache: NewsCacheStatus;
}

/** Nagłówki obu kategorii (bez streszczenia – to dokłada `getNewsDigest` w `server.ts`). */
export async function getHeadlines(deps: NewsServiceDeps = defaultNewsDeps): Promise<HeadlinesResult> {
  const now = deps.now();
  const results = await Promise.all((deps.sources ?? NEWS_SOURCES).map((source) => loadFeed(source, deps)));
  const categories = Object.fromEntries(
    NEWS_CATEGORIES.map((category) => [
      category,
      rankHeadlines(
        results.filter((result) => result.source.category === category).flatMap((result) => result.headlines),
        now,
        HEADLINES_PER_CATEGORY,
      ),
    ]),
  ) as Record<NewsCategory, Headline[]>;

  // Kategoria bez nagłówków to dla widgetu awaria: wtedy całość jako demo (z oznaczeniem).
  if (NEWS_CATEGORIES.some((category) => categories[category].length === 0)) {
    return { digest: demoDigest(now), cache: "demo" };
  }
  const feeds: FeedStatus[] = results.map(({ source, state }) => ({ id: source.id, name: source.name, category: source.category, state }));
  return {
    digest: { fetchedAt: now.toISOString(), demo: false, categories, summary: null, summaryPending: false, feeds },
    cache: overallCache(results),
  };
}
