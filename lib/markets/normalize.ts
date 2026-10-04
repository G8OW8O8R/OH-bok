import {
  binanceKlineSchema,
  binanceMiniTickerSchema,
  coinGeckoChartSchema,
  coinGeckoMarketSchema,
  type HistoryPoint,
  type Quote,
} from "./schema";
import { symbolFromBinance, symbolFromCoinGecko } from "./symbols";

/**
 * Normalizacja obu źródeł do wspólnego formatu. Rekord, który nie przejdzie walidacji,
 * jest odrzucany pojedynczo: jedna zła pozycja nie psuje całej paczki.
 */

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Wiadomość strumienia złożonego Binance (`{ stream, data }`) → notowanie albo null. */
export function normalizeBinanceMiniTicker(raw: unknown): Quote | null {
  const parsed = binanceMiniTickerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { E, s, c, o, h, l } = parsed.data.data;
  const symbol = symbolFromBinance(s);
  if (!symbol) return null;
  return {
    symbol,
    priceUsd: c,
    change24hPct: roundPct(((c - o) / o) * 100),
    high24hUsd: h,
    low24hUsd: l,
    updatedAt: new Date(E).toISOString(),
    source: "binance",
  };
}

/** CoinGecko `/coins/markets` → notowania (nieznane monety i złe rekordy pominięte). */
export function normalizeCoinGeckoMarkets(raw: unknown, fetchedAt: Date): Quote[] {
  if (!Array.isArray(raw)) return [];
  const quotes: Quote[] = [];
  for (const item of raw) {
    const parsed = coinGeckoMarketSchema.safeParse(item);
    if (!parsed.success) continue;
    const symbol = symbolFromCoinGecko(parsed.data.id);
    if (!symbol) continue;
    const { current_price, high_24h, low_24h, price_change_percentage_24h, last_updated } = parsed.data;
    quotes.push({
      symbol,
      priceUsd: current_price,
      change24hPct: price_change_percentage_24h == null ? null : roundPct(price_change_percentage_24h),
      high24hUsd: high_24h ?? null,
      low24hUsd: low_24h ?? null,
      updatedAt: last_updated ? new Date(last_updated).toISOString() : fetchedAt.toISOString(),
      source: "coingecko",
    });
  }
  return quotes;
}

/** Świece Binance → punkty (czas otwarcia świecy, cena zamknięcia), rosnąco w czasie. */
export function normalizeBinanceKlines(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: HistoryPoint[] = [];
  for (const item of raw) {
    const parsed = binanceKlineSchema.safeParse(item);
    if (parsed.success) points.push({ t: parsed.data[0], p: parsed.data[4] });
  }
  return sortByTime(points);
}

/** CoinGecko `market_chart` → punkty (bez cen ≤ 0), rosnąco w czasie. */
export function normalizeCoinGeckoChart(raw: unknown): HistoryPoint[] {
  const parsed = coinGeckoChartSchema.safeParse(raw);
  if (!parsed.success) return [];
  const points = parsed.data.prices
    .filter(([, p]) => Number.isFinite(p) && p > 0)
    .map(([t, p]) => ({ t: Math.round(t), p }));
  return sortByTime(points);
}

function sortByTime(points: HistoryPoint[]): HistoryPoint[] {
  return [...points].sort((a, b) => a.t - b.t);
}

/**
 * Przerzedzenie do najwyżej `max` punktów (wykres, sparkline): równe odstępy w indeksach,
 * pierwszy i ostatni punkt zawsze zostają.
 */
export function downsample(points: readonly HistoryPoint[], max: number): HistoryPoint[] {
  if (points.length <= max) return points.slice();
  if (max < 2) return max === 1 ? points.slice(-1) : [];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]).filter(
    (point): point is HistoryPoint => point !== undefined,
  );
}
