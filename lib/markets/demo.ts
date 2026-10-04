import type { HistoryPoint, HistoryRange, MarketHistory, MarketsSnapshot, Quote } from "./schema";
import { MARKET_SYMBOLS, type MarketSymbol } from "./symbols";
import { HISTORY_RANGE_CONFIG } from "./history";

/**
 * Dane demo: ostatnia deska ratunku, gdy żadne źródło nie odpowiada i nie ma cache.
 * Zawsze oznaczone `source: "demo"`; alerty na nich nie odpalają.
 */
export const DEMO_PRICES_USD: Record<MarketSymbol, number> = {
  BTC: 85_000,
  ETH: 2_700,
  SOL: 120,
  XRP: 1.5,
  ADA: 0.25,
};

export function demoQuotes(now: Date): Quote[] {
  return MARKET_SYMBOLS.map((symbol) => ({
    symbol,
    priceUsd: DEMO_PRICES_USD[symbol],
    change24hPct: 0,
    high24hUsd: null,
    low24hUsd: null,
    updatedAt: now.toISOString(),
    source: "demo",
  }));
}

export function demoSnapshot(now: Date): MarketsSnapshot {
  return { quotes: demoQuotes(now), fetchedAt: now.toISOString(), source: "demo" };
}

/** Deterministyczny generator (mulberry32): ta sama seria dla tego samego symbolu i zakresu. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Błądzenie losowe kończące się na cenie demo, w siatce zakresu. */
export function demoHistory(symbol: MarketSymbol, range: HistoryRange, now: Date): MarketHistory {
  const { stepMs, limit } = HISTORY_RANGE_CONFIG[range];
  const random = seeded(hash(`${symbol}:${range}`));
  const end = Math.floor(now.getTime() / stepMs) * stepMs;
  const prices = [DEMO_PRICES_USD[symbol]];
  for (let i = 1; i < limit; i += 1) {
    const last = prices[prices.length - 1] ?? DEMO_PRICES_USD[symbol];
    prices.push(last * (1 + (random() - 0.5) * 0.012));
  }
  const points: HistoryPoint[] = prices.reverse().map((p, i) => ({ t: end - (limit - 1 - i) * stepMs, p }));
  return { symbol, range, points, fetchedAt: now.toISOString(), source: "demo" };
}
