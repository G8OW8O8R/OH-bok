"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState, type FormEvent } from "react";
import { Segmented, type SegmentItem } from "@/components/ui/Segmented";
import { isPending, MAX_ALERTS, parseThreshold, type AlertCondition, type PriceAlert } from "@/lib/markets/alerts";
import { formatPrice, fromUsd } from "@/lib/markets/currency";
import { MARKET_ASSETS, MARKET_SYMBOLS, type MarketSymbol } from "@/lib/markets/symbols";
import { spring, transitionFor } from "@/lib/motion";
import { formatTime } from "@/lib/time";
import { useAlertsStore } from "@/store/alerts";
import { useMarketsStore } from "@/store/markets";
import { CoinBadge, type Display } from "./shared";

const CONDITIONS: SegmentItem<AlertCondition>[] = [
  { id: "above", label: "powyżej" },
  { id: "below", label: "poniżej" },
];

/** Warunek alertu w skrócie z makiety („< 27 500 $”), pełne słowo dla czytników. */
function ConditionText({ alert }: { alert: PriceAlert }) {
  return (
    <>
      <span aria-hidden>{alert.condition === "above" ? ">" : "<"} </span>
      <span className="sr-only">{alert.condition === "above" ? "powyżej " : "poniżej "}</span>
      {formatPrice(alert.threshold, alert.currency)}
    </>
  );
}

/** Panel boczny okna (ornament `aside`): aktywne alerty (do 3) i krótki formularz. */
export function AlertsAside({ display, selected, onShowAll }: { display: Display; selected: MarketSymbol; onShowAll: () => void }) {
  const alerts = useAlertsStore((state) => state.alerts);
  const pending = alerts.filter(isPending);
  const shown = pending.slice(-3).reverse();
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex w-[clamp(11rem,calc(var(--u)*12),15rem)] flex-col gap-3" data-testid="markets-aside">
      <h3 className="text-center text-title font-medium text-text-primary">Alerty cenowe</h3>
      {shown.length === 0 ? (
        <p className="text-center text-caption text-white/82">Brak aktywnych alertów.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {shown.map((alert) => (
              <motion.li
                key={alert.id}
                layout
                initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={transitionFor(reduceMotion, spring.default)}
                className="flex items-center gap-2.5 rounded-[calc(var(--u)*0.9)] border border-white/10 bg-white/8 px-3 py-2"
              >
                <CoinBadge symbol={alert.symbol} size="sm" />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-body text-text-primary">{MARKET_ASSETS[alert.symbol].name}</span>
                  <span className="block text-caption text-white/82 tabular-nums">
                    <ConditionText alert={alert} />
                  </span>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {pending.length > shown.length && (
        <button
          type="button"
          onClick={onShowAll}
          className="self-center rounded-pill px-3 py-1 text-caption text-white/82 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber"
        >
          +{pending.length - shown.length} więcej
        </button>
      )}
      <AlertForm display={display} selected={selected} compact />
    </div>
  );
}

/** Zakładka „Alerty”: pełna lista (aktywne / wykonane) i ten sam formularz. */
export function AlertsTab({ display, selected, timeZone }: { display: Display; selected: MarketSymbol; timeZone: string }) {
  const alerts = useAlertsStore((state) => state.alerts);
  const pending = alerts.filter(isPending).reverse();
  const done = alerts.filter((alert) => !isPending(alert)).reverse();
  const formId = useId();

  return (
    <div className="grid gap-x-[calc(var(--u)*2)] gap-y-6 pt-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-testid="markets-alerts">
      <div className="flex min-w-0 flex-col gap-5">
        <AlertSection title="Aktywne" alerts={pending} empty="Brak aktywnych alertów." timeZone={timeZone} />
        {done.length > 0 && <AlertSection title="Wykonane" alerts={done} timeZone={timeZone} />}
      </div>
      <section aria-labelledby={`${formId}-title`} className="flex min-w-0 flex-col gap-3 max-lg:border-t max-lg:border-white/10 max-lg:pt-5">
        <h3 id={`${formId}-title`} className="text-title font-medium text-text-primary">
          Nowy alert
        </h3>
        <AlertForm display={display} selected={selected} />
      </section>
    </div>
  );
}

function AlertSection({ title, alerts, empty, timeZone }: { title: string; alerts: PriceAlert[]; empty?: string; timeZone: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-2 text-caption font-medium text-white/82">
        {title} ({alerts.length})
      </h3>
      {alerts.length === 0 ? (
        <p className="text-body text-white/82">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertRow({ alert, timeZone }: { alert: PriceAlert; timeZone: string }) {
  const name = MARKET_ASSETS[alert.symbol].name;
  const fired = alert.triggeredAt !== null;
  return (
    <li className="flex items-center gap-3 border-b border-white/8 py-2.5 last:border-b-0" data-testid="market-alert">
      <CoinBadge symbol={alert.symbol} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-body text-text-primary">
          {name} <span className="text-white/82 tabular-nums"><ConditionText alert={alert} /></span>
        </span>
        {fired && alert.triggeredAt && (
          <span className="flex items-center gap-1 text-caption text-white/82 tabular-nums">
            <Check aria-hidden className="size-3.5 text-amber" strokeWidth={2.25} />
            wykonany {formatTime(new Date(alert.triggeredAt), timeZone)}
            {alert.triggeredPrice !== null && ` · ${formatPrice(alert.triggeredPrice, alert.currency)}`}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => useAlertsStore.getState().remove(alert.id)}
        aria-label={`Usuń alert: ${name} ${alert.condition === "above" ? "powyżej" : "poniżej"} ${formatPrice(alert.threshold, alert.currency)}`}
        className="grid size-8 shrink-0 place-items-center rounded-full text-white/82 hover:bg-white/10 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber pointer-coarse:size-11"
      >
        <X aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
    </li>
  );
}

interface AlertFormProps {
  display: Display;
  /** Waluta wybrana w liście: domyślna dla nowego alertu. */
  selected: MarketSymbol;
  /** Wąski wariant do panelu bocznego. */
  compact?: boolean;
}

/** Formularz alertu: kryptowaluta, powyżej / poniżej, próg w walucie wyświetlania. */
function AlertForm({ display, selected, compact = false }: AlertFormProps) {
  const ids = useId();
  const [symbol, setSymbol] = useState<MarketSymbol | null>(null);
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const count = useAlertsStore((state) => state.alerts.length);
  const coin = symbol ?? selected;
  const quote = useMarketsStore((state) => state.quotes[coin] ?? null);
  const current = quote ? fromUsd(quote.priceUsd, display.currency, display.rate) : null;
  const full = count >= MAX_ALERTS;
  const unit = display.currency === "PLN" ? "zł" : "$";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const threshold = parseThreshold(text);
    if (threshold === null) {
      setError("Podaj próg – liczbę większą od zera.");
      setAdded(null);
      return;
    }
    const ok = useAlertsStore.getState().add({ symbol: coin, condition, threshold, currency: display.currency }, new Date());
    if (!ok) {
      setError(`Limit to ${MAX_ALERTS} alertów.`);
      return;
    }
    setError(null);
    setText("");
    setAdded(`Dodano: ${MARKET_ASSETS[coin].name} ${condition === "above" ? "powyżej" : "poniżej"} ${formatPrice(threshold, display.currency)}`);
  };

  return (
    <form onSubmit={submit} noValidate className={`flex flex-col ${compact ? "gap-2.5" : "gap-3"}`} aria-label="Nowy alert cenowy">
      <div role="radiogroup" aria-label="Kryptowaluta" className={`flex ${compact ? "justify-between" : "gap-2"}`}>
        {MARKET_SYMBOLS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === coin}
            aria-label={MARKET_ASSETS[value].name}
            onClick={() => setSymbol(value)}
            className="rounded-full p-0.5 opacity-60 ring-amber transition-[opacity,box-shadow] duration-(--dur-feedback) hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white aria-checked:opacity-100 aria-checked:ring-2"
          >
            <CoinBadge symbol={value} size="sm" />
          </button>
        ))}
      </div>
      <Segmented label="Warunek" items={CONDITIONS} value={condition} onChange={setCondition} className="self-stretch [&>button]:flex-1" />
      <div className={`flex gap-2 ${compact ? "flex-col" : "items-start"}`}>
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">Próg ({display.currency})</span>
          <input
            id={`${ids}-threshold`}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            placeholder={current === null ? "Próg" : formatPrice(current, display.currency).replace(/\s?(zł|\$)$/, "")}
            aria-invalid={error !== null}
            aria-describedby={error ? `${ids}-error` : undefined}
            disabled={full}
            className="field w-full pr-10 text-body tabular-nums placeholder:text-white/60"
            data-testid="alert-threshold"
          />
          <span aria-hidden className="pointer-events-none absolute right-4 text-body text-white/82">
            {unit}
          </span>
        </label>
        <button
          type="submit"
          disabled={full}
          className="shrink-0 rounded-pill bg-amber px-5 py-2.5 text-body font-medium text-[rgb(20_14_8)] transition-[scale] duration-(--dur-feedback) hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:opacity-40"
        >
          Dodaj alert
        </button>
      </div>
      <p id={`${ids}-error`} role={error ? "alert" : "status"} className={`min-h-[1.3em] text-caption ${error ? "market-down" : "text-white/82"}`}>
        {error ?? (full ? `Limit ${MAX_ALERTS} alertów – usuń wykonane.` : added)}
      </p>
    </form>
  );
}
