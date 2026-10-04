"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ease } from "@/lib/motion";
import { chartGeometry, nearestIndex, pointLabel, timeTicks, withLivePrice } from "@/lib/markets/chart";
import { formatPrice, fromUsd } from "@/lib/markets/currency";
import { downsample } from "@/lib/markets/normalize";
import type { HistoryRange, Quote } from "@/lib/markets/schema";
import { MARKET_ASSETS, type MarketSymbol } from "@/lib/markets/symbols";
import { useMarketHistory } from "@/lib/markets/use-history";
import { useElementSize } from "@/lib/use-element-size";
import type { Display } from "./shared";

interface PriceChartProps {
  symbol: MarketSymbol;
  range: HistoryRange;
  quote: Quote | null;
  display: Display;
  timeZone: string;
}

export const RANGE_NAMES: Record<HistoryRange, string> = { "1D": "doba", "1T": "tydzień", "1M": "miesiąc" };

/** Zapas wokół linii: kropka końca, poświata i dymek celownika nie są ucinane. */
const INSET = { insetX: 10, insetTop: 16, insetBottom: 10 };
const FALLBACK = { width: 600, height: 240 };
/** Pióro jak krzywa na pulpicie; wypełnienie odsłania się 220 ms za nim. */
const PEN_S = 1.1;
const FILL_DELAY_S = 0.22;
/** Wiersze tabeli dla czytników (przerzedzona historia). */
const TABLE_ROWS = 12;
/** Tyle miejsca (px) nad punktem potrzebuje dymek celownika; bliżej krawędzi staje pod punktem. */
const TIP_ROOM = 64;

/**
 * Wykres ceny: bursztynowa linia z poświatą i gradientem, rysowana przy otwarciu i zmianie
 * waluty lub zakresu; ostatni punkt idzie za ceną na żywo. Najechanie (dotyk, strzałki) pokazuje
 * celownik z ceną i czasem. Dla czytników tabela danych.
 */
export function PriceChart({ symbol, range, quote, display, timeZone }: PriceChartProps) {
  const reduceMotion = useReducedMotion();
  const ids = useId();
  const { data, status, retry } = useMarketHistory(symbol, range);
  const [ref, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const [hover, setHover] = useState<{ key: string; index: number } | null>(null);

  // Prymitywy w zależnościach: nowy obiekt notowania przy tej samej cenie nie przelicza wykresu.
  const liveT = quote && quote.source !== "demo" ? Date.parse(quote.updatedAt) : null;
  const liveP = quote?.priceUsd ?? null;
  const series = useMemo(
    () => (data ? withLivePrice(data.points, range, liveT === null || liveP === null ? null : { t: liveT, p: liveP }) : []),
    [data, range, liveT, liveP],
  );
  const geometry = useMemo(() => chartGeometry(series, { ...size, ...INSET }), [series, size]);
  const animKey = `${symbol}-${range}`;
  const hoverIndex = hover?.key === animKey ? hover.index : null;

  const points = geometry?.points ?? [];
  const first = points[0];
  const last = points[points.length - 1];
  const ticks = first && last ? timeTicks(range, first.t, last.t, timeZone) : [];
  const xOf = (t: number) =>
    first && last ? INSET.insetX + ((t - first.t) / (last.t - first.t || 1)) * (size.width - 2 * INSET.insetX) : 0;
  const draw = reduceMotion ? { duration: 0 } : { duration: PEN_S, ease: ease.pen };
  const reveal = reduceMotion ? { duration: 0 } : { duration: PEN_S, ease: ease.pen, delay: FILL_DELAY_S };
  const point = hoverIndex === null ? null : (points[hoverIndex] ?? null);
  const money = (usd: number) => {
    const value = fromUsd(usd, display.currency, display.rate);
    return value === null ? "–" : formatPrice(value, display.currency);
  };

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (points.length > 0) setHover({ key: animKey, index: nearestIndex(points, event.clientX - box.left) });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const lastIndex = points.length - 1;
    if (lastIndex < 0) return;
    const current = hoverIndex ?? lastIndex;
    const step = Math.max(1, Math.round(points.length / 24));
    const next =
      event.key === "ArrowLeft" ? Math.max(0, current - step)
      : event.key === "ArrowRight" ? Math.min(lastIndex, current + step)
      : event.key === "Home" ? 0
      : event.key === "End" ? lastIndex
      : event.key === "Escape" && hoverIndex !== null ? -1
      : null;
    if (next === null) return;
    event.preventDefault();
    if (next === -1) event.stopPropagation(); // Esc chowa celownik, nie zamyka okna
    setHover(next === -1 ? null : { key: animKey, index: next });
  };

  const name = MARKET_ASSETS[symbol].name;
  const table = downsample(points, TABLE_ROWS);

  return (
    <figure className="flex min-h-0 flex-1 flex-col" data-testid="market-chart" data-range={range}>
      <figcaption className="sr-only">
        Cena {name} – {RANGE_NAMES[range]}
        {geometry && `, od ${money(geometry.min)} do ${money(geometry.max)}`}.
      </figcaption>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`Wykres ${name}, ${RANGE_NAMES[range]}. Strzałki w lewo i w prawo odczytują punkty.`}
        onPointerMove={pointAt}
        onPointerDown={pointAt}
        onPointerLeave={(event) => event.pointerType === "mouse" && setHover(null)}
        onPointerUp={(event) => event.pointerType !== "mouse" && setHover(null)}
        onPointerCancel={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKeyDown}
        className="market-chart relative min-h-0 flex-1 touch-pan-y rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber"
      >
        {!geometry && (
          <div className="absolute inset-0 grid place-items-center text-center">
            {status === "error" ? (
              <p className="flex flex-col items-center gap-2 text-body text-text-secondary">
                Nie udało się wczytać wykresu.
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-pill bg-white/10 px-4 py-1.5 text-caption text-text-primary hover:bg-white/16 focus-visible:outline-2 focus-visible:outline-amber"
                >
                  Spróbuj ponownie
                </button>
              </p>
            ) : (
              <p className="text-caption text-text-tertiary">Wczytuję wykres…</p>
            )}
          </div>
        )}
        {/* Wypełnienie i linia w osobnych SVG: poświata (filtr) tylko na linii. */}
        {geometry && (
          <>
            <svg aria-hidden viewBox={`0 0 ${size.width} ${size.height}`} className="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id={`${ids}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--accent-amber)" stopOpacity="0.46" />
                  <stop offset="1" stopColor="var(--accent-amber)" stopOpacity="0" />
                </linearGradient>
                <clipPath id={`${ids}-reveal`}>
                  <motion.rect
                    key={animKey}
                    x={0}
                    y={-20}
                    height={size.height + 40}
                    initial={{ width: 0 }}
                    animate={{ width: size.width }}
                    transition={reveal}
                  />
                </clipPath>
              </defs>
              <path d={geometry.area} fill={`url(#${ids}-fill)`} clipPath={`url(#${ids}-reveal)`} />
            </svg>
            <svg aria-hidden viewBox={`0 0 ${size.width} ${size.height}`} className="market-curve absolute inset-0 size-full overflow-visible">
              <motion.path
                key={animKey}
                d={geometry.line}
                fill="none"
                stroke="var(--accent-amber)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={draw}
              />
              {point && (
                <line x1={point.x} x2={point.x} y1={0} y2={size.height} stroke="rgb(255 255 255 / 0.35)" strokeWidth={1} strokeDasharray="3 4" />
              )}
            </svg>
          </>
        )}
        {last && !point && (
          <motion.span
            key={`${animKey}-end`}
            aria-hidden
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { delay: PEN_S, duration: 0.24, ease: ease.out }}
            style={{ left: last.x, top: last.y }}
            className="market-end absolute size-2.5 -translate-1/2 rounded-full bg-amber"
          />
        )}
        {point && (
          <>
            <span
              aria-hidden
              style={{ left: point.x, top: point.y }}
              className="absolute size-3 -translate-1/2 rounded-full border-2 border-[rgb(20_14_8)] bg-amber"
            />
            <span
              data-testid="market-crosshair"
              style={{
                left: Math.min(Math.max(point.x, 70), size.width - 70),
                // Przy górnej krawędzi dymek schodzi pod punkt, żeby nie zasłaniał ceny nad wykresem.
                top: point.y < TIP_ROOM ? point.y + 14 : point.y - 14,
              }}
              className={`pointer-events-none absolute flex -translate-x-1/2 ${point.y < TIP_ROOM ? "" : "-translate-y-full"} flex-col items-center rounded-xl bg-[rgb(14_16_20/0.86)] px-3 py-1.5 text-center whitespace-nowrap shadow-(--depth-mid)`}
            >
              <span className="text-body font-semibold text-text-primary tabular-nums">{money(point.p)}</span>
              <span className="text-micro text-text-secondary tabular-nums">{pointLabel(point.t, range, timeZone)}</span>
            </span>
          </>
        )}
        <span role="status" className="sr-only">
          {point ? `${money(point.p)}, ${pointLabel(point.t, range, timeZone)}` : ""}
        </span>
        {data?.source === "demo" && (
          <span className="absolute top-0 left-0 rounded-pill bg-white/10 px-2 py-0.5 text-micro text-text-secondary">dane demo</span>
        )}
      </div>
      <div aria-hidden className="relative mt-2 h-5 shrink-0 text-micro text-text-secondary tabular-nums">
        {ticks.map((tick) => {
          const x = xOf(tick.t);
          // Etykiety przy samych krawędziach nie wychodzą poza wykres.
          if (x < 18 || x > size.width - 18) return null;
          return (
            <span key={tick.t} style={{ left: x }} className="absolute -translate-x-1/2">
              {tick.label}
            </span>
          );
        })}
      </div>
      {/* Owijka: tabela ignoruje `overflow` i `height` z `sr-only` i wystawała poza okno. */}
      <div className="sr-only">
        <table>
          <caption>
            Cena {name}, {RANGE_NAMES[range]}
          </caption>
          <thead>
            <tr>
              <th scope="col">Czas</th>
              <th scope="col">Cena</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.t}>
                <td>{pointLabel(row.t, range, timeZone)}</td>
                <td>{money(row.p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
