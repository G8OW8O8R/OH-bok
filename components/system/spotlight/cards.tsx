"use client";

import { Bell, BellRing, Check, Droplet, ListPlus, ListX, Sparkles, Undo2, Wind } from "lucide-react";
import { createElement, useId, useState } from "react";
import { changeClass, CoinBadge, useDisplay } from "@/components/apps/markets/shared";
import { weatherIcon } from "@/components/apps/weather-icons";
import { Odometer } from "@/components/ui/Odometer";
import { splitLinks } from "@/lib/assistant/reply";
import { formatChange, formatPrice, fromUsd } from "@/lib/markets/currency";
import { priceDirection, type PriceDirection } from "@/lib/markets/odometer";
import { sparkline } from "@/lib/markets/sparkline";
import { MARKET_ASSETS, type MarketSymbol } from "@/lib/markets/symbols";
import { useMarketHistory } from "@/lib/markets/use-history";
import { useFxRate, useMarketFeed, useMarketsReady } from "@/lib/markets/use-markets";
import { WEATHER_LABELS } from "@/lib/scenes";
import type { DailyForecast } from "@/lib/weather/schema";
import { useMarketsStore } from "@/store/markets";

/**
 * Mini-karty Spotlightu (zadanie 7b): wynik jako mikrowizualizacja, nie sam tekst.
 * Karty informacyjne (cena, prognoza) są wierszem wyniku; karty akcji pojawiają się po „Gotowe”.
 */

const SPARK = { width: 132, height: 40 };

/** Cena na żywo: licznik, zmiana 24h, sparkline 1D. Otwarta karta trzyma kanał cen. */
export function PriceCard({ symbol, now }: { symbol: MarketSymbol; now: Date }) {
  const ready = useMarketsReady();
  useMarketFeed(true);
  useFxRate(ready);
  const display = useDisplay(now);
  const quote = useMarketsStore((state) => state.quotes[symbol] ?? null);
  const { data } = useMarketHistory(symbol, "1D");
  const priceUsd = quote?.priceUsd ?? null;
  const [last, setLast] = useState({ price: priceUsd, direction: null as PriceDirection | null });
  if (priceUsd !== last.price) {
    setLast({ price: priceUsd, direction: priceUsd === null || last.price === null ? null : priceDirection(last.price, priceUsd) });
  }
  const price = priceUsd === null ? null : fromUsd(priceUsd, display.currency, display.rate);
  const change = quote?.change24hPct ?? null;
  const line = data ? sparkline(data.points, SPARK.width, SPARK.height, 3) : null;
  const gradientId = useId();
  const down = line?.trend === "down";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4" data-testid="spotlight-price">
      <CoinBadge symbol={symbol} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-white/82">
          {MARKET_ASSETS[symbol].name} · {symbol}
        </p>
        <p className="flex items-baseline gap-x-3 max-sm:flex-col max-sm:items-start">
          {price === null ? (
            <span className="text-lead font-medium text-text-primary">–</span>
          ) : (
            <Odometer
              value={formatPrice(price, display.currency)}
              direction={last.direction}
              resetKey={`${symbol}-${display.currency}`}
              className="text-lead font-medium text-text-primary"
            />
          )}
          <span className={`text-body font-medium tabular-nums ${changeClass(change)}`}>
            {change === null ? "" : formatChange(change)}
            <span className="sr-only"> w 24 godziny</span>
          </span>
        </p>
      </div>
      <svg aria-hidden viewBox={`0 0 ${SPARK.width} ${SPARK.height}`} className="h-auto w-[clamp(4.5rem,22%,8.25rem)] shrink-0 self-center overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={down ? "var(--market-down)" : "var(--accent-amber)"} stopOpacity="0.32" />
            <stop offset="1" stopColor={down ? "var(--market-down)" : "var(--accent-amber)"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {line && (
          <>
            <path d={`${line.path}L${SPARK.width} ${SPARK.height}L0 ${SPARK.height}Z`} fill={`url(#${gradientId})`} />
            <path
              d={line.path}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={down ? "stroke-(--market-down)" : "stroke-amber"}
            />
          </>
        )}
      </svg>
    </div>
  );
}

function formatTemperature(celsius: number | null): string {
  if (celsius === null) return "–";
  const rounded = Math.round(celsius);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/** „8 października” (data kalendarzowa bez strefy). */
const DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });

function formatMm(mm: number): string {
  return `${mm.toLocaleString("pl-PL", { maximumFractionDigits: mm >= 10 ? 0 : 1 })} mm`;
}

/** Prognoza dnia: ikona, stan, maks./min., opad, wiatr. */
export function WeatherCard({ day, label }: { day: DailyForecast; label: string }) {
  const precipitation = [
    day.precipitationProbabilityMax === null ? null : `${Math.round(day.precipitationProbabilityMax)}%`,
    day.precipitationSumMm ? formatMm(day.precipitationSumMm) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4" data-testid="spotlight-weather">
      <span className="spotlight-icon" data-tone="quiet" aria-hidden>
        {createElement(weatherIcon(day.state, true, day.weatherCode), { className: "size-[55%]", strokeWidth: 1.75 })}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-white/82">
          {label} · {DAY_MONTH.format(new Date(`${day.date}T12:00:00Z`))}
        </p>
        <p className="flex items-baseline gap-2.5">
          <span className="text-lead font-medium text-text-primary tabular-nums">{formatTemperature(day.temperatureMaxC)}</span>
          <span className="text-body text-white/78 tabular-nums">{formatTemperature(day.temperatureMinC)}</span>
          <span className="truncate text-body text-text-primary">{WEATHER_LABELS[day.state]}</span>
        </p>
      </div>
      <dl className="flex shrink-0 flex-col items-end gap-0.5 text-caption text-white/82 tabular-nums max-sm:hidden">
        {precipitation && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Opady</dt>
            <Droplet aria-hidden className="size-3.5" strokeWidth={1.75} />
            <dd>{precipitation}</dd>
          </div>
        )}
        {day.windMaxKmh !== null && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Wiatr do</dt>
            <Wind aria-hidden className="size-3.5" strokeWidth={1.75} />
            <dd>{Math.round(day.windMaxKmh)} km/h</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export type OutcomeTone = "reminder" | "items" | "removed" | "alert";

const OUTCOME_ICON = { reminder: Bell, items: ListPlus, removed: ListX, alert: BellRing } as const;

interface OutcomeCardProps {
  tone: OutcomeTone;
  title: string;
  detail: string;
  /** Pozycje (dodane produkty) jako kapsuły. */
  chips?: readonly string[];
  undone: boolean;
  onUndo: (() => void) | null;
}

/** Wynik akcji po „Gotowe”: co się stało + „Cofnij”. */
export function OutcomeCard({ tone, title, detail, chips, undone, onUndo }: OutcomeCardProps) {
  const Icon = OUTCOME_ICON[tone];
  return (
    <div className="glass spotlight-card flex items-center gap-4" data-depth="mid" data-testid="spotlight-outcome" data-tone={tone}>
      <span className="spotlight-icon" data-tone={undone ? "quiet" : undefined} aria-hidden>
        {undone ? <Undo2 className="size-[50%]" strokeWidth={2} /> : <Icon className="size-[50%]" strokeWidth={2} />}
      </span>
      <div className="min-w-0 flex-1">
        {/* Na telefonie tytuł się zawija (długie „Dodano 3 pozycje, reszta…”). */}
        <p className="text-title font-medium text-text-primary sm:truncate">{undone ? `Cofnięto: ${title}` : title}</p>
        {chips && chips.length > 0 && !undone ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Pozycje">
            {chips.map((chip) => (
              <li key={chip} className="flex items-center gap-1 rounded-pill bg-white/10 px-2.5 py-0.5 text-caption text-text-primary">
                <Check aria-hidden className="size-3.5 text-amber" strokeWidth={2.25} />
                {chip}
              </li>
            ))}
          </ul>
        ) : (
          <p className="truncate text-body text-white/82">{detail}</p>
        )}
      </div>
      {onUndo && !undone && (
        <button
          type="button"
          onClick={onUndo}
          data-testid="spotlight-undo"
          className="flex shrink-0 items-center gap-1.5 rounded-pill bg-white/12 px-3.5 py-2 text-body text-text-primary transition-colors duration-(--dur-feedback) hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Undo2 aria-hidden className="size-4" strokeWidth={2} />
          Cofnij
        </button>
      )}
    </div>
  );
}

interface AnswerCardProps {
  /** Odsłonięta część odpowiedzi (słowo po słowie). */
  text: string;
  fullText: string;
  complete: boolean;
  revealing: boolean;
  /** Nazwa dostawcy do podpisu („odpowiedział: Groq”). */
  provider: string | null;
  /** Odpowiedź urwała się po części tekstu. */
  error: string | null;
}

/**
 * Odpowiedź tekstowa asystenta. Czytnik dostaje całość po odsłonięciu (`aria-busy`), linki tylko
 * z białej listy (`splitLinks`) – inne adresy zostają tekstem.
 */
export function AnswerCard({ text, fullText, complete, revealing, provider, error }: AnswerCardProps) {
  const done = complete && !revealing;
  return (
    <div className="glass spotlight-card flex gap-4" data-depth="mid" data-testid="spotlight-answer" data-complete={done || undefined}>
      <span className="spotlight-icon" aria-hidden>
        <Sparkles className="size-[50%]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 self-center">
        <div aria-live="polite" aria-busy={!done} aria-atomic="true">
          <p className="text-title text-pretty text-text-primary" data-full={fullText.length}>
            {splitLinks(text).map((part, index) =>
              part.href ?
                <a
                  key={index}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-white/50 underline-offset-[0.2em] transition-colors duration-(--dur-feedback) hover:decoration-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {part.text}
                </a>
              : <span key={index}>{part.text}</span>,
            )}
            {!done && <span aria-hidden className="spotlight-caret" />}
          </p>
          {error && done && <p className="mt-1 text-body text-white/82">{error}</p>}
        </div>
        {provider && (
          <p className="mt-2 text-caption text-white/82" data-testid="spotlight-source">
            odpowiedział: {provider}
          </p>
        )}
      </div>
    </div>
  );
}
