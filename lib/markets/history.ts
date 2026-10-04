import type { HistoryRange } from "./schema";

/**
 * Zakresy wykresu: świece Binance (interwał × liczba) albo `market_chart` CoinGecko (dni),
 * cache po stronie serwera dopasowany do zakresu.
 */
export interface HistoryRangeConfig {
  /** Interwał świec Binance. */
  interval: "15m" | "1h" | "4h";
  stepMs: number;
  /** Liczba świec (i maks. liczba punktów po przerzedzeniu danych CoinGecko). */
  limit: number;
  /** Zakres `market_chart` CoinGecko. */
  days: 1 | 7 | 30;
  revalidateS: number;
}

const MINUTE = 60_000;

export const HISTORY_RANGE_CONFIG: Record<HistoryRange, HistoryRangeConfig> = {
  "1D": { interval: "15m", stepMs: 15 * MINUTE, limit: 96, days: 1, revalidateS: 5 * 60 },
  "1T": { interval: "1h", stepMs: 60 * MINUTE, limit: 168, days: 7, revalidateS: 30 * 60 },
  "1M": { interval: "4h", stepMs: 240 * MINUTE, limit: 180, days: 30, revalidateS: 2 * 60 * 60 },
};

/** Sparkline 24 h powstaje z historii 1D, przerzedzonej do tylu punktów. */
export const SPARKLINE_POINTS = 48;
