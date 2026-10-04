import { z } from "zod";
import { MARKET_SYMBOLS } from "./symbols";

/**
 * Jeden format danych rynków niezależnie od źródła. Ceny zawsze w USD
 * (pary USDT na Binance traktujemy jak USD); przeliczenie na PLN dopiero przy wyświetlaniu.
 */
export const marketSymbolSchema = z.enum(MARKET_SYMBOLS);

export const QUOTE_SOURCES = ["binance", "coingecko", "demo"] as const;
export const quoteSourceSchema = z.enum(QUOTE_SOURCES);
export type QuoteSource = z.infer<typeof quoteSourceSchema>;

const price = z.number().positive();

export const quoteSchema = z.object({
  symbol: marketSymbolSchema,
  priceUsd: price,
  /** Zmiana 24 h w procentach (null = źródło nie podało). */
  change24hPct: z.number().nullable(),
  high24hUsd: price.nullable(),
  low24hUsd: price.nullable(),
  /** Chwila notowania (ISO). */
  updatedAt: z.iso.datetime({ offset: true }),
  source: quoteSourceSchema,
});
export type Quote = z.infer<typeof quoteSchema>;

/** Odpowiedź `/api/markets` (zapasowe źródło). */
export const marketsSnapshotSchema = z.object({
  quotes: z.array(quoteSchema),
  fetchedAt: z.iso.datetime({ offset: true }),
  source: quoteSourceSchema,
});
export type MarketsSnapshot = z.infer<typeof marketsSnapshotSchema>;

export const HISTORY_RANGES = ["1D", "1T", "1M"] as const;
export const historyRangeSchema = z.enum(HISTORY_RANGES);
export type HistoryRange = z.infer<typeof historyRangeSchema>;

/** Punkt wykresu: czas (ms) i cena zamknięcia w USD. */
export const historyPointSchema = z.object({ t: z.number().int().nonnegative(), p: price });
export type HistoryPoint = z.infer<typeof historyPointSchema>;

/** Odpowiedź `/api/markets/history`. */
export const marketHistorySchema = z.object({
  symbol: marketSymbolSchema,
  range: historyRangeSchema,
  points: z.array(historyPointSchema),
  fetchedAt: z.iso.datetime({ offset: true }),
  source: quoteSourceSchema,
});
export type MarketHistory = z.infer<typeof marketHistorySchema>;

/** Odpowiedź `/api/fx`: średni kurs NBP (tabela A). */
export const fxRateSchema = z.object({
  base: z.literal("USD"),
  quote: z.literal("PLN"),
  rate: price,
  /** Dzień, którego dotyczy tabela NBP (`YYYY-MM-DD`). */
  effectiveDate: z.iso.date(),
  /** Do kiedy kurs jest aktualny: następny dzień roboczy, po publikacji tabeli (ISO). */
  validUntil: z.iso.datetime({ offset: true }),
  fetchedAt: z.iso.datetime({ offset: true }),
});
export type FxRate = z.infer<typeof fxRateSchema>;

// --- Surowe dane źródeł -------------------------------------------------------

/** Liczba zapisana jako tekst (Binance podaje ceny jako stringi). */
const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .transform(Number)
  .pipe(z.number().positive());

/** Binance, strumień `<symbol>@miniTicker` w opakowaniu strumienia złożonego. */
export const binanceMiniTickerSchema = z.object({
  stream: z.string(),
  data: z.object({
    e: z.literal("24hrMiniTicker"),
    E: z.number().int().positive(),
    s: z.string(),
    c: decimalString,
    o: decimalString,
    h: decimalString,
    l: decimalString,
  }),
});

/** Binance REST `/api/v3/klines`: [czas otwarcia, open, high, low, close, …]. */
export const binanceKlineSchema = z.tuple(
  [z.number().int().nonnegative(), decimalString, decimalString, decimalString, decimalString],
  z.unknown(),
);

/** CoinGecko `/coins/markets` (jeden rekord). */
export const coinGeckoMarketSchema = z.object({
  id: z.string(),
  current_price: price,
  high_24h: price.nullish(),
  low_24h: price.nullish(),
  price_change_percentage_24h: z.number().nullish(),
  last_updated: z.iso.datetime({ offset: true }).nullish(),
});

/** CoinGecko `/coins/{id}/market_chart`. */
export const coinGeckoChartSchema = z.object({
  prices: z.array(z.tuple([z.number().nonnegative(), z.number()])),
});

/** NBP `/api/exchangerates/rates/a/usd/`. */
export const nbpRateSchema = z.object({
  table: z.literal("A"),
  code: z.literal("USD"),
  rates: z
    .array(z.object({ no: z.string(), effectiveDate: z.iso.date(), mid: price }))
    .min(1),
});
