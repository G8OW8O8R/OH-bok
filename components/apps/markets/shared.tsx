"use client";

import { displayCurrency, type Currency } from "@/lib/markets/currency";
import { usableFx } from "@/lib/markets/fx";
import type { FxRate } from "@/lib/markets/schema";
import { MARKET_ASSETS, type MarketSymbol } from "@/lib/markets/symbols";
import { useMarketsStore } from "@/store/markets";

/** Waluta wyświetlania i kurs: PLN tylko z używalnym kursem NBP (inaczej USD). */
export interface Display {
  currency: Currency;
  rate: number | null;
  fx: FxRate | null;
}

export function useDisplay(now: Date): Display {
  const requested = useMarketsStore((state) => state.currency);
  const stored = useMarketsStore((state) => state.fx);
  const fx = usableFx(stored, now);
  const rate = fx?.rate ?? null;
  return { currency: displayCurrency(requested, rate), rate, fx };
}

const BADGE_SIZE = {
  sm: "size-7 text-[0.5625rem]",
  md: "size-[clamp(2rem,4.4vh,calc(var(--u)*2.4))] text-[0.625rem]",
} as const;

/** Koło waluty w kolorze marki ze skrótem (bez logotypów). Dekoracja: nazwa stoi obok. */
export function CoinBadge({ symbol, size = "md" }: { symbol: MarketSymbol; size?: keyof typeof BADGE_SIZE }) {
  const { color, ink } = MARKET_ASSETS[symbol];
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color, color: ink }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold tracking-tight ring-1 ring-white/15 ring-inset ${BADGE_SIZE[size]}`}
    >
      {symbol}
    </span>
  );
}

/** Klasa koloru zmiany 24h (jasne odcienie z `styles/markets.css`). */
export function changeClass(pct: number | null): string {
  if (pct === null || pct === 0) return "text-text-secondary";
  return pct > 0 ? "market-up" : "market-down";
}
