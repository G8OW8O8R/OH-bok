"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ALERT_CONDITIONS, describeAlert, isPending, type AlertCondition } from "@/lib/markets/alerts";
import { CURRENCIES, displayCurrency, formatChange, formatPrice, fromUsd, toUsd } from "@/lib/markets/currency";
import { FEED_MODES, FEED_STATUS_LABELS, parseFeedMode, type FeedMode } from "@/lib/markets/feed-machine";
import { usableFx } from "@/lib/markets/fx";
import { marketHistorySchema, type QuoteSource } from "@/lib/markets/schema";
import { sparkline, type Sparkline } from "@/lib/markets/sparkline";
import { MARKET_SYMBOLS, parseSymbol, type MarketSymbol } from "@/lib/markets/symbols";
import { useFxRate, useMarketFeed } from "@/lib/markets/use-markets";
import { useAlertsStore } from "@/store/alerts";
import { useMarketsStore } from "@/store/markets";

/**
 * Tymczasowy podgląd danych rynków (zadanie 9a, tylko dev; okno Rynków w 9b): stan kanału
 * i źródło, ceny z sparkline 24 h, USD/PLN, alerty. Otwarty podgląd subskrybuje kanał cen.
 */

const SOURCE_LABELS: Record<QuoteSource, string> = { binance: "Binance", coingecko: "CoinGecko", demo: "demo" };
const MODE_LABELS: Record<FeedMode, string> = { auto: "auto", fallback: "wymuś zapas", offline: "wymuś offline" };
const SPARK_W = 64;
const SPARK_H = 20;

const chip =
  "rounded-pill px-2 py-0.5 text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber aria-[current=true]:bg-white/10 aria-[current=true]:text-amber disabled:opacity-40";
const input = "field rounded-md bg-white/8 px-1.5 py-0.5 text-text-primary";

function modeHref(mode: FeedMode): string {
  const params = new URLSearchParams(window.location.search);
  if (mode === "auto") params.delete("markets");
  else params.set("markets", mode);
  const query = params.toString();
  return query ? `?${query}` : "/";
}

function useSparklines(): Partial<Record<MarketSymbol, { line: Sparkline | null; source: QuoteSource }>> {
  const [lines, setLines] = useState<Partial<Record<MarketSymbol, { line: Sparkline | null; source: QuoteSource }>>>({});
  useEffect(() => {
    const controller = new AbortController();
    for (const symbol of MARKET_SYMBOLS) {
      void fetch(`/api/markets/history?symbol=${symbol}&range=1D`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((json: unknown) => {
          const parsed = marketHistorySchema.safeParse(json);
          if (!parsed.success) return;
          const entry = { line: sparkline(parsed.data.points, SPARK_W, SPARK_H), source: parsed.data.source };
          setLines((current) => ({ ...current, [symbol]: entry }));
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, []);
  return lines;
}

export function MarketsPreview() {
  useMarketFeed(true);
  useFxRate(true);
  const sparklines = useSparklines();
  const { quotes, status, source, receivedAt, currency, fx } = useMarketsStore();
  const alerts = useAlertsStore((state) => state.alerts);
  const [mode] = useState(() => parseFeedMode(new URLSearchParams(window.location.search).get("markets")));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rate = usableFx(fx, now)?.rate ?? null;
  const shown = displayCurrency(currency, rate);

  const [symbol, setSymbol] = useState<MarketSymbol>("BTC");
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [threshold, setThreshold] = useState("");

  const addAlert = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(threshold.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    useAlertsStore.getState().add({ symbol, condition, threshold: value, currency: shown }, new Date());
    setThreshold("");
  };

  /** Alert, który odpali przy najbliższej paczce cen (próg 1% po „złej” stronie ceny). */
  const addInstantAlert = () => {
    const quote = quotes[symbol];
    if (!quote) return;
    const price = fromUsd(quote.priceUsd, shown, rate);
    if (price === null) return;
    const value = condition === "above" ? price * 0.99 : price * 1.01;
    useAlertsStore.getState().add({ symbol, condition, threshold: Number(value.toPrecision(6)), currency: shown }, new Date());
  };

  const ageS = receivedAt ? Math.max(0, Math.round((now.getTime() - Date.parse(receivedAt)) / 1000)) : null;

  return (
    <section
      aria-label="Rynki (dev)"
      className="w-88 space-y-2 rounded-2xl border border-glass-border bg-glass p-3 text-text-primary backdrop-blur-xl"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">Rynki · {FEED_STATUS_LABELS[status]}</h2>
        <p className="text-text-secondary tabular-nums">
          {source ? SOURCE_LABELS[source] : "–"}
          {ageS !== null && ` · ${ageS} s temu`}
        </p>
      </header>

      <nav aria-label="Źródło (dev)" className="flex gap-1">
        {FEED_MODES.map((value) => (
          // Pełne przeładowanie: tryb kanału wybierany jest przy starcie.
          <a key={value} href={modeHref(value)} aria-current={value === mode} className={chip}>
            {MODE_LABELS[value]}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {CURRENCIES.map((value) => (
          <button
            key={value}
            type="button"
            aria-current={value === shown}
            disabled={value === "PLN" && rate === null}
            onClick={() => useMarketsStore.getState().setCurrency(value)}
            className={chip}
          >
            {value}
          </button>
        ))}
        <span className="text-text-secondary tabular-nums">
          {fx && rate !== null
            ? `NBP ${fx.rate.toFixed(4)} z ${fx.effectiveDate}, do ${new Date(fx.validUntil).toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
            : "brak kursu – tylko USD"}
        </span>
      </div>

      <table className="w-full tabular-nums">
        <tbody>
          {MARKET_SYMBOLS.map((key) => {
            const quote = quotes[key];
            const price = quote ? fromUsd(quote.priceUsd, shown, rate) : null;
            const spark = sparklines[key];
            return (
              <tr key={key} className="h-7">
                <th scope="row" className="text-left font-medium">
                  {key}
                </th>
                <td className="text-right">{price === null ? "–" : formatPrice(price, shown)}</td>
                <td
                  className={`text-right ${quote?.change24hPct == null ? "text-text-secondary" : quote.change24hPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {quote?.change24hPct == null ? "–" : formatChange(quote.change24hPct)}
                </td>
                <td className="w-17 pl-2">
                  {spark?.line && (
                    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} width={SPARK_W} height={SPARK_H} aria-hidden>
                      <title>{SOURCE_LABELS[spark.source]}</title>
                      <path
                        d={spark.line.path}
                        fill="none"
                        strokeWidth="1.5"
                        className={spark.line.trend === "down" ? "stroke-rose-300" : "stroke-emerald-300"}
                      />
                    </svg>
                  )}
                </td>
                <td className="pl-1 text-text-tertiary">{quote ? SOURCE_LABELS[quote.source].slice(0, 2) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form onSubmit={addAlert} className="flex flex-wrap items-center gap-1.5">
        <select aria-label="Symbol" value={symbol} onChange={(e) => setSymbol(parseSymbol(e.target.value) ?? "BTC")} className={input}>
          {MARKET_SYMBOLS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Warunek"
          value={condition}
          onChange={(e) => setCondition(e.target.value === "below" ? "below" : "above")}
          className={input}
        >
          {ALERT_CONDITIONS.map((value) => (
            <option key={value} value={value}>
              {value === "above" ? "powyżej" : "poniżej"}
            </option>
          ))}
        </select>
        <input
          aria-label={`Próg (${shown})`}
          inputMode="decimal"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder={shown}
          className={`${input} w-24`}
        />
        <button type="submit" className={chip}>
          dodaj
        </button>
        <button type="button" onClick={addInstantAlert} disabled={!quotes[symbol]} className={chip}>
          test: odpal
        </button>
      </form>

      {alerts.length > 0 && (
        <ul className="space-y-0.5">
          {alerts.map((alert) => {
            const thresholdUsd = toUsd(alert.threshold, alert.currency, rate);
            return (
              <li key={alert.id} className="flex items-center justify-between gap-2">
                <span className={isPending(alert) ? "" : "text-text-tertiary line-through"}>
                  {describeAlert(alert)}
                  {alert.currency === "PLN" && thresholdUsd !== null && (
                    <span className="text-text-tertiary"> ≈ {formatPrice(thresholdUsd, "USD")}</span>
                  )}
                </span>
                <button type="button" onClick={() => useAlertsStore.getState().remove(alert.id)} className={chip}>
                  usuń
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
