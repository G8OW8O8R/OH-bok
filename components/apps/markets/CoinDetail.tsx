"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Odometer } from "@/components/ui/Odometer";
import { Segmented, type SegmentItem } from "@/components/ui/Segmented";
import { formatChange, formatPrice, fromUsd } from "@/lib/markets/currency";
import { priceDirection, type PriceDirection } from "@/lib/markets/odometer";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/markets/schema";
import { MARKET_ASSETS, type MarketSymbol } from "@/lib/markets/symbols";
import { prefetchHistory } from "@/lib/markets/use-history";
import { useMarketsStore } from "@/store/markets";
import { PriceChart, RANGE_NAMES } from "./PriceChart";
import { changeClass, CoinBadge, type Display } from "./shared";

interface CoinDetailProps {
  symbol: MarketSymbol;
  range: HistoryRange;
  onRange: (range: HistoryRange) => void;
  display: Display;
  timeZone: string;
  /** Arkusz na telefonie: powrót do listy. */
  onBack?: () => void;
}

const RANGE_ITEMS: SegmentItem<HistoryRange>[] = HISTORY_RANGES.map((id) => ({ id, label: id, description: RANGE_NAMES[id] }));

/** Szczegół wybranej waluty: duża cena (licznik), zmiana 24h, zakres i wykres. */
export function CoinDetail({ symbol, range, onRange, display, timeZone, onBack }: CoinDetailProps) {
  const quote = useMarketsStore((state) => state.quotes[symbol] ?? null);
  const { name } = MARKET_ASSETS[symbol];
  const priceUsd = quote?.priceUsd ?? null;
  const [last, setLast] = useState({ symbol, price: priceUsd, direction: null as PriceDirection | null });
  if (last.symbol !== symbol || last.price !== priceUsd) {
    setLast({
      symbol,
      price: priceUsd,
      direction: last.symbol === symbol && priceUsd !== null ? priceDirection(last.price, priceUsd) : null,
    });
  }
  // Pozostałe zakresy tej waluty pobierają się w tle, gdy wykres bieżącego już stoi.
  useEffect(() => {
    const timer = window.setTimeout(() => HISTORY_RANGES.forEach((other) => other !== range && prefetchHistory(symbol, other)), 1500);
    return () => window.clearTimeout(timer);
  }, [symbol, range]);

  const price = priceUsd === null ? null : fromUsd(priceUsd, display.currency, display.rate);
  const change = quote?.change24hPct ?? null;
  const high = quote?.high24hUsd == null ? null : fromUsd(quote.high24hUsd, display.currency, display.rate);
  const low = quote?.low24hUsd == null ? null : fromUsd(quote.low24hUsd, display.currency, display.rate);

  return (
    <section aria-label={`${name}: szczegóły`} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="market-detail">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 mb-2 flex items-center gap-0.5 self-start rounded-pill py-2 pr-3 pl-1 text-body text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber"
        >
          <ChevronLeft aria-hidden className="size-5" strokeWidth={1.75} />
          Wszystkie
        </button>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CoinBadge symbol={symbol} size="sm" />
          <h3 className="truncate text-title font-medium text-text-primary">
            {name} <span className="text-text-secondary">{symbol}</span>
          </h3>
        </div>
        <Segmented label="Zakres wykresu" items={RANGE_ITEMS} value={range} onChange={onRange} />
      </div>
      <p className="mt-(--market-gap) text-(length:--market-price) leading-none font-medium tracking-[-0.03em] text-text-primary">
        <Odometer
          value={price === null ? "–" : formatPrice(price, display.currency)}
          direction={last.direction}
          resetKey={`${symbol}:${display.currency}`}
        />
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-caption text-text-secondary tabular-nums">
        <span className={`font-medium ${changeClass(change)}`}>
          {change === null ? "–" : formatChange(change)} <span className="text-text-secondary">· 24h</span>
        </span>
        {high !== null && low !== null && (
          <span>
            maks. {formatPrice(high, display.currency)} · min. {formatPrice(low, display.currency)}
          </span>
        )}
      </p>
      <div className="mt-(--market-gap) flex min-h-0 flex-1 flex-col">
        <PriceChart symbol={symbol} range={range} quote={quote} display={display} timeZone={timeZone} />
      </div>
    </section>
  );
}
