"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Odometer } from "@/components/ui/Odometer";
import { formatChange, formatPrice, fromUsd } from "@/lib/markets/currency";
import { priceDirection, type PriceDirection } from "@/lib/markets/odometer";
import type { Quote } from "@/lib/markets/schema";
import { sparkline } from "@/lib/markets/sparkline";
import { MARKET_ASSETS, MARKET_SYMBOLS, type MarketSymbol } from "@/lib/markets/symbols";
import { useMarketHistory } from "@/lib/markets/use-history";
import { useMarketsStore } from "@/store/markets";
import { changeClass, CoinBadge, type Display } from "./shared";

interface CoinListProps {
  display: Display;
  selected: MarketSymbol;
  onSelect: (symbol: MarketSymbol) => void;
  /** Enter / dotknięcie: na telefonie przejście do wykresu. */
  onOpen: (symbol: MarketSymbol) => void;
}

/** Na wąskim ekranie zmiana 24h stoi pod ceną (nazwa waluty nie jest ucinana). */
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_4.75em_4.5em] sm:gap-x-[clamp(0.5rem,1.6vw,1.25rem)]";

/**
 * Lista 5 kryptowalut: koło waluty, nazwa, cena (licznik), zmiana 24h, sparkline 24 h.
 * ARIA `listbox`: strzałki przenoszą wybór (wybór idzie za fokusem), wybrany wiersz w bursztynowej
 * obwódce jak na makiecie.
 */
export function CoinList({ display, selected, onSelect, onOpen }: CoinListProps) {
  const quotes = useMarketsStore((state) => state.quotes);
  const refs = useRef(new Map<MarketSymbol, HTMLLIElement>());
  const headerId = useId();

  const onKeyDown = (event: KeyboardEvent) => {
    const index = MARKET_SYMBOLS.indexOf(selected);
    const last = MARKET_SYMBOLS.length - 1;
    const next =
      event.key === "ArrowDown" ? Math.min(index + 1, last)
      : event.key === "ArrowUp" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next !== null) {
      event.preventDefault();
      const symbol = MARKET_SYMBOLS[next];
      if (!symbol) return;
      onSelect(symbol);
      refs.current.get(symbol)?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(selected);
    }
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div id={headerId} aria-hidden className={`${COLUMNS} px-3 pb-2 text-caption text-white/82`}>
        <span>Kryptowaluta</span>
        <span className="text-right">Cena</span>
        <span className="text-right max-sm:hidden">24h</span>
        <span />
      </div>
      <ul role="listbox" aria-label="Kryptowaluty" onKeyDown={onKeyDown} className="flex flex-col">
        {MARKET_SYMBOLS.map((symbol) => (
          <CoinRow
            key={symbol}
            symbol={symbol}
            quote={quotes[symbol] ?? null}
            display={display}
            selected={symbol === selected}
            onClick={() => {
              onSelect(symbol);
              onOpen(symbol);
            }}
            itemRef={(element) => {
              if (element) refs.current.set(symbol, element);
              else refs.current.delete(symbol);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

interface CoinRowProps {
  symbol: MarketSymbol;
  quote: Quote | null;
  display: Display;
  selected: boolean;
  onClick: () => void;
  itemRef: (element: HTMLLIElement | null) => void;
}

const SPARK = { width: 72, height: 24 };

function CoinRow({ symbol, quote, display, selected, onClick, itemRef }: CoinRowProps) {
  const { name } = MARKET_ASSETS[symbol];
  const priceUsd = quote?.priceUsd ?? null;
  // Zmiana ceny = mignięcie wiersza i kierunek przewijania cyfr (nie przy zmianie waluty).
  const [flash, setFlash] = useState({ price: priceUsd, direction: null as PriceDirection | null, tick: 0 });
  if (priceUsd !== flash.price) {
    setFlash({ price: priceUsd, direction: priceUsd === null ? null : priceDirection(flash.price, priceUsd), tick: flash.tick + 1 });
  }
  const price = priceUsd === null ? null : fromUsd(priceUsd, display.currency, display.rate);
  const priceText = price === null ? "–" : formatPrice(price, display.currency);
  const change = quote?.change24hPct ?? null;
  const changeText = change === null ? "–" : formatChange(change);

  return (
    <li
      ref={itemRef}
      role="option"
      aria-selected={selected}
      aria-label={`${name}, ${priceText}, ${change === null ? "zmiana 24h nieznana" : `${changeText} w 24 godziny`}`}
      tabIndex={selected ? 0 : -1}
      data-autofocus={selected || undefined}
      onClick={onClick}
      data-testid="market-row"
      data-symbol={symbol}
      className={`market-row relative isolate cursor-pointer rounded-[calc(var(--u)*1.1)] border px-3 outline-none transition-[background-color,border-color] duration-(--dur-feedback) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        selected
          ? "border-amber bg-amber/8 shadow-[0_0_18px_rgb(245_160_74/0.28)]"
          : "border-transparent hover:bg-white/6 [&+&]:before:absolute [&+&]:before:inset-x-3 [&+&]:before:-top-px [&+&]:before:h-px [&+&]:before:bg-white/10"
      }`}
    >
      {flash.direction && (
        <span
          key={flash.tick}
          aria-hidden
          data-dir={flash.direction}
          className="market-flash pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
        />
      )}
      <div className={`${COLUMNS} h-full text-body`}>
        <span className="flex min-w-0 items-center gap-3">
          <CoinBadge symbol={symbol} />
          <span className="truncate text-title font-medium text-text-primary">{name}</span>
        </span>
        <span className="flex flex-col items-end">
          <Odometer
            value={priceText}
            direction={flash.direction}
            resetKey={display.currency}
            className="text-right text-title font-medium text-text-primary"
          />
          <span className={`text-caption font-medium tabular-nums sm:hidden ${changeClass(change)}`}>{changeText}</span>
        </span>
        <span className={`text-right font-medium tabular-nums max-sm:hidden ${changeClass(change)}`}>{changeText}</span>
        <Sparkline symbol={symbol} />
      </div>
    </li>
  );
}

function Sparkline({ symbol }: { symbol: MarketSymbol }) {
  const { data } = useMarketHistory(symbol, "1D");
  const line = data ? sparkline(data.points, SPARK.width, SPARK.height, 2) : null;
  return (
    <svg aria-hidden viewBox={`0 0 ${SPARK.width} ${SPARK.height}`} className="h-auto w-full overflow-visible">
      {line && (
        <path
          d={line.path}
          fill="none"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className={line.trend === "down" ? "stroke-(--market-down)" : "stroke-amber"}
        />
      )}
    </svg>
  );
}
