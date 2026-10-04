import { classifyCacheAge, responseDate, type FreshCacheStatus } from "@/lib/cache-age";
import { demoHistory, demoSnapshot } from "./demo";
import { FX_MAX_AGE_MS, NBP_USD_URL, normalizeNbp } from "./fx";
import { HISTORY_RANGE_CONFIG } from "./history";
import { downsample, normalizeBinanceKlines, normalizeCoinGeckoChart, normalizeCoinGeckoMarkets } from "./normalize";
import type { FxRate, HistoryRange, MarketHistory, MarketsSnapshot } from "./schema";
import { MARKET_ASSETS, MARKET_SYMBOLS, type MarketSymbol } from "./symbols";

/**
 * Dane rynków po stronie serwera: CoinGecko (ceny awaryjne), Binance REST (historia),
 * NBP (kurs USD/PLN). Kolejność jak w pogodzie: cache danych Next.js → ostatnie dane z pamięci
 * instancji (`stale`) → demo. Nigdy nie rzuca wyjątku.
 */
export const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";
/** Endpoint Binance tylko do danych rynkowych (działa także tam, gdzie `api.binance.com` zwraca 451). */
export const BINANCE_REST_URL = "https://data-api.binance.vision/api/v3";
export const MARKETS_REVALIDATE_S = 30;
/** Dane NBP w cache danych: godzina; CDN i klient trzymają kurs do następnego dnia roboczego. */
export const FX_REVALIDATE_S = 60 * 60;
export const MARKETS_CACHE_TAG = "markets";
const UPSTREAM_TIMEOUT_MS = 4000;
/** Ostatnie ceny z pamięci instancji wolno pokazać najwyżej tyle po pobraniu. */
const LAST_QUOTES_MAX_AGE_MS = 60 * 60 * 1000;
const LAST_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MarketsCacheStatus = FreshCacheStatus | "demo";
export type MarketsProvider = "coingecko" | "binance" | "nbp" | "demo";

export interface ServiceResult<T> {
  data: T;
  cache: MarketsCacheStatus;
  provider: MarketsProvider;
}

/** L1: ostatnie dobre dane w pamięci instancji (ulotne, tylko siatka pod cache danych). */
export interface LastKnown<T> {
  get(key: string, now: Date): T | null;
  set(key: string, value: T, at: Date): void;
}

export function createLastKnown<T>(maxAgeMs: number, maxEntries = 50): LastKnown<T> {
  const entries = new Map<string, { value: T; at: number }>();
  return {
    get(key, now) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (now.getTime() - entry.at > maxAgeMs) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value, at) {
      entries.delete(key);
      entries.set(key, { value, at: at.getTime() });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export interface MarketsServiceDeps {
  fetch: typeof fetch;
  now: () => Date;
  /** Klucz CoinGecko (plan demo), opcjonalny; tylko po stronie serwera. */
  coinGeckoKey: string | null;
  quotes: LastKnown<MarketsSnapshot>;
  history: LastKnown<MarketHistory>;
  fx: LastKnown<FxRate>;
  onUpstreamError?: (source: string, error: unknown) => void;
}

const defaultDeps: MarketsServiceDeps = {
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  coinGeckoKey: process.env.COINGECKO_API_KEY?.trim() || null,
  quotes: createLastKnown(LAST_QUOTES_MAX_AGE_MS),
  history: createLastKnown(LAST_HISTORY_MAX_AGE_MS),
  fx: createLastKnown(FX_MAX_AGE_MS),
  onUpstreamError: (source, error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[markets] ${source} niedostępne, używam cache/zapasu: ${reason}`);
  },
};

export function buildCoinGeckoMarketsUrl(): string {
  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: MARKET_SYMBOLS.map((symbol) => MARKET_ASSETS[symbol].coingecko).join(","),
    price_change_percentage: "24h",
  });
  return `${COINGECKO_API_URL}/coins/markets?${params}`;
}

export function buildBinanceKlinesUrl(symbol: MarketSymbol, range: HistoryRange): string {
  const { interval, limit } = HISTORY_RANGE_CONFIG[range];
  const params = new URLSearchParams({ symbol: MARKET_ASSETS[symbol].binance, interval, limit: String(limit) });
  return `${BINANCE_REST_URL}/klines?${params}`;
}

export function buildCoinGeckoChartUrl(symbol: MarketSymbol, range: HistoryRange): string {
  const params = new URLSearchParams({ vs_currency: "usd", days: String(HISTORY_RANGE_CONFIG[range].days) });
  return `${COINGECKO_API_URL}/coins/${MARKET_ASSETS[symbol].coingecko}/market_chart?${params}`;
}

function coinGeckoHeaders(key: string | null): HeadersInit {
  return key ? { accept: "application/json", "x-cg-demo-api-key": key } : { accept: "application/json" };
}

async function fetchJson(
  deps: MarketsServiceDeps,
  url: string,
  revalidate: number,
  headers?: HeadersInit,
): Promise<{ json: unknown; fetchedAt: Date; cache: FreshCacheStatus }> {
  const started = deps.now();
  const response = await deps.fetch(url, {
    headers,
    next: { revalidate, tags: [MARKETS_CACHE_TAG] },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const fetchedAt = responseDate(response, started);
  return { json: await response.json(), fetchedAt, cache: classifyCacheAge(started.getTime() - fetchedAt.getTime(), revalidate) };
}

/** Ceny wszystkich symboli z CoinGecko (zapasowe źródło klienta, odpytywane co 30 s). */
export async function getQuotes(deps: MarketsServiceDeps = defaultDeps): Promise<ServiceResult<MarketsSnapshot>> {
  const now = deps.now();
  try {
    const { json, fetchedAt, cache } = await fetchJson(
      deps,
      buildCoinGeckoMarketsUrl(),
      MARKETS_REVALIDATE_S,
      coinGeckoHeaders(deps.coinGeckoKey),
    );
    const quotes = normalizeCoinGeckoMarkets(json, fetchedAt);
    if (quotes.length === 0) throw new Error("brak poprawnych notowań");
    const data: MarketsSnapshot = { quotes, fetchedAt: fetchedAt.toISOString(), source: "coingecko" };
    deps.quotes.set("all", data, fetchedAt);
    return { data, cache, provider: "coingecko" };
  } catch (error) {
    deps.onUpstreamError?.("CoinGecko", error);
    const last = deps.quotes.get("all", now);
    if (last) return { data: last, cache: "stale", provider: "coingecko" };
    return { data: demoSnapshot(now), cache: "demo", provider: "demo" };
  }
}

/** Historia do wykresu: świece Binance → `market_chart` CoinGecko → pamięć instancji → demo. */
export async function getHistory(
  symbol: MarketSymbol,
  range: HistoryRange,
  deps: MarketsServiceDeps = defaultDeps,
): Promise<ServiceResult<MarketHistory>> {
  const now = deps.now();
  const key = `${symbol}:${range}`;
  const config = HISTORY_RANGE_CONFIG[range];

  const attempts: Array<{ provider: "binance" | "coingecko"; load: () => Promise<ServiceResult<MarketHistory>> }> = [
    {
      provider: "binance",
      load: async () => {
        const { json, fetchedAt, cache } = await fetchJson(deps, buildBinanceKlinesUrl(symbol, range), config.revalidateS);
        const points = normalizeBinanceKlines(json);
        if (points.length < 2) throw new Error("za mało świec");
        return { data: { symbol, range, points, fetchedAt: fetchedAt.toISOString(), source: "binance" }, cache, provider: "binance" };
      },
    },
    {
      provider: "coingecko",
      load: async () => {
        const { json, fetchedAt, cache } = await fetchJson(
          deps,
          buildCoinGeckoChartUrl(symbol, range),
          config.revalidateS,
          coinGeckoHeaders(deps.coinGeckoKey),
        );
        // CoinGecko daje gęstszą siatkę (5 min dla 1 dnia): przycinamy do zakresu i przerzedzamy.
        const from = fetchedAt.getTime() - config.days * 24 * 60 * 60 * 1000;
        const points = downsample(
          normalizeCoinGeckoChart(json).filter((point) => point.t >= from),
          config.limit,
        );
        if (points.length < 2) throw new Error("za mało punktów");
        return {
          data: { symbol, range, points, fetchedAt: fetchedAt.toISOString(), source: "coingecko" },
          cache,
          provider: "coingecko",
        };
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt.load();
      deps.history.set(key, result.data, new Date(result.data.fetchedAt));
      return result;
    } catch (error) {
      deps.onUpstreamError?.(attempt.provider === "binance" ? "Binance" : "CoinGecko", error);
    }
  }

  const last = deps.history.get(key, now);
  if (last) {
    return { data: last, cache: "stale", provider: last.source === "binance" ? "binance" : "coingecko" };
  }
  return { data: demoHistory(symbol, range, now), cache: "demo", provider: "demo" };
}

/** Kurs USD/PLN z NBP → pamięć instancji → null (klient pokazuje wtedy tylko USD). */
export async function getFx(deps: MarketsServiceDeps = defaultDeps): Promise<ServiceResult<FxRate> | null> {
  const now = deps.now();
  try {
    const { json, fetchedAt, cache } = await fetchJson(deps, NBP_USD_URL, FX_REVALIDATE_S, { accept: "application/json" });
    const fx = normalizeNbp(json, fetchedAt);
    if (!fx) throw new Error("nieprawidłowa odpowiedź NBP");
    deps.fx.set("usd", fx, new Date(`${fx.effectiveDate}T00:00:00Z`));
    return { data: fx, cache, provider: "nbp" };
  } catch (error) {
    deps.onUpstreamError?.("NBP", error);
    const last = deps.fx.get("usd", now);
    return last ? { data: last, cache: "stale", provider: "nbp" } : null;
  }
}
