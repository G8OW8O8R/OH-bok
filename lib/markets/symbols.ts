/** Śledzone kryptowaluty: pary USDT na Binance, identyfikatory CoinGecko. */
export const MARKET_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "ADA"] as const;

export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];

export interface MarketAsset {
  symbol: MarketSymbol;
  name: string;
  /** Para na Binance (wielkie litery, jak w polu `s` strumienia). */
  binance: string;
  /** Identyfikator monety w CoinGecko. */
  coingecko: string;
}

export const MARKET_ASSETS: Record<MarketSymbol, MarketAsset> = {
  BTC: { symbol: "BTC", name: "Bitcoin", binance: "BTCUSDT", coingecko: "bitcoin" },
  ETH: { symbol: "ETH", name: "Ethereum", binance: "ETHUSDT", coingecko: "ethereum" },
  SOL: { symbol: "SOL", name: "Solana", binance: "SOLUSDT", coingecko: "solana" },
  XRP: { symbol: "XRP", name: "XRP", binance: "XRPUSDT", coingecko: "ripple" },
  ADA: { symbol: "ADA", name: "Cardano", binance: "ADAUSDT", coingecko: "cardano" },
};

const BY_BINANCE = new Map(MARKET_SYMBOLS.map((symbol) => [MARKET_ASSETS[symbol].binance, symbol]));
const BY_COINGECKO = new Map(MARKET_SYMBOLS.map((symbol) => [MARKET_ASSETS[symbol].coingecko, symbol]));

export function parseSymbol(value: unknown): MarketSymbol | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  return (MARKET_SYMBOLS as readonly string[]).includes(upper) ? (upper as MarketSymbol) : null;
}

export function symbolFromBinance(pair: string): MarketSymbol | null {
  return BY_BINANCE.get(pair.toUpperCase()) ?? null;
}

export function symbolFromCoinGecko(id: string): MarketSymbol | null {
  return BY_COINGECKO.get(id) ?? null;
}
