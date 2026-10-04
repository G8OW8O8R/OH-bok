"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { StatusCapsule, Window, WindowScroll } from "@/components/system/Window";
import { useWindows } from "@/components/system/Windows";
import { Segmented, type SegmentItem } from "@/components/ui/Segmented";
import { tabId, tabPanelId, Tabs, type TabItem } from "@/components/ui/Tabs";
import { CURRENCIES, type Currency } from "@/lib/markets/currency";
import { FEED_STATUS_LABELS, type FeedStatus } from "@/lib/markets/feed-machine";
import type { HistoryRange, QuoteSource } from "@/lib/markets/schema";
import type { MarketSymbol } from "@/lib/markets/symbols";
import { useFxRate, useMarketFeed } from "@/lib/markets/use-markets";
import { duration, ease } from "@/lib/motion";
import { formatTime } from "@/lib/time";
import { useMarketsStore } from "@/store/markets";
import { AlertsAside, AlertsTab } from "./markets/Alerts";
import { CoinDetail } from "./markets/CoinDetail";
import { CoinList } from "./markets/CoinList";
import { useDisplay, type Display } from "./markets/shared";

type MarketsTab = "coins" | "alerts";

const TABS: TabItem<MarketsTab>[] = [
  { id: "coins", label: "Kryptowaluty" },
  { id: "alerts", label: "Alerty" },
];
const TABS_ID = "markets";

interface MarketsAppProps {
  now: Date;
  timeZone: string;
}

/**
 * Okno Rynków: lista kryptowalut z licznikiem cen i sparkline,
 * szczegół z wykresem, alerty w panelu bocznym i w zakładce, stan połączenia w kapsule pod oknem.
 * Kanał cen i kurs NBP działają, dopóki okno jest otwarte (dane z zadania 9a).
 */
export function MarketsApp({ now, timeZone }: MarketsAppProps) {
  const [tab, setTab] = useState<MarketsTab>("coins");
  const [selected, setSelected] = useState<MarketSymbol>("BTC");
  const display = useDisplay(now);

  return (
    <Window
      id="markets"
      size="large"
      tabs={<Tabs idPrefix={TABS_ID} label="Widok rynków" items={TABS} value={tab} onChange={setTab} />}
      headerActions={<CurrencySwitch display={display} />}
      aside={tab === "coins" ? <AlertsAside display={display} selected={selected} onShowAll={() => setTab("alerts")} /> : undefined}
      asideOnSheet={false}
      status={<MarketsStatus display={display} timeZone={timeZone} />}
    >
      <MarketsContent tab={tab} selected={selected} onSelect={setSelected} display={display} timeZone={timeZone} />
    </Window>
  );
}

const CURRENCY_LABELS: Record<Currency, string> = { USD: "dolar amerykański", PLN: "złoty" };

function CurrencySwitch({ display }: { display: Display }) {
  const noRate = display.rate === null;
  const items: SegmentItem<Currency>[] = CURRENCIES.map((id) => ({
    id,
    label: id,
    description: CURRENCY_LABELS[id],
    disabled: id === "PLN" && noRate,
  }));
  return (
    <Segmented
      label="Waluta"
      items={items}
      value={display.currency}
      onChange={(currency) => useMarketsStore.getState().setCurrency(currency)}
      title={noRate ? "Brak kursu NBP – ceny tylko w USD" : undefined}
    />
  );
}

interface MarketsContentProps {
  tab: MarketsTab;
  selected: MarketSymbol;
  onSelect: (symbol: MarketSymbol) => void;
  display: Display;
  timeZone: string;
}

function MarketsContent({ tab, selected, onSelect, display, timeZone }: MarketsContentProps) {
  // Okno otwarte = ceny na żywo i kurs NBP (przełącznik PLN).
  useMarketFeed(true);
  useFxRate(true);
  const { sheets } = useWindows();
  const reduceMotion = useReducedMotion();
  const [range, setRange] = useState<HistoryRange>("1D");
  // Telefon: lista albo wykres wybranej waluty (z powrotem do listy).
  const [view, setView] = useState<"list" | "detail">("list");
  const showDetail = sheets && view === "detail";
  const swap = {
    initial: { opacity: 0, x: reduceMotion ? 0 : showDetail ? 24 : -24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0 },
    transition: { duration: reduceMotion ? duration.reducedFade : duration.feedback, ease: ease.out },
  };

  const backToList = () => {
    setView("list");
    // Fokus wraca na wiersz waluty, z której weszliśmy.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="market-row"][data-symbol="${selected}"]`)?.focus());
  };

  return (
    <div className="markets-app relative flex min-h-0 flex-1 flex-col">
      <div
        role="tabpanel"
        id={tabPanelId(TABS_ID, "coins")}
        aria-labelledby={tabId(TABS_ID, "coins")}
        // Na desktopie zakładka „Kryptowaluty” wyznacza wysokość okna także pod „Alertami”
        // (bez skoku rozmiaru przy przełączaniu): jest tylko niewidoczna i nieaktywna.
        hidden={sheets && tab !== "coins"}
        inert={tab !== "coins"}
        className={`flex min-h-0 flex-1 flex-col ${tab !== "coins" ? "invisible" : ""}`}
      >
        {sheets ? (
          <AnimatePresence mode="wait" initial={false}>
            {showDetail ? (
              <motion.div key="detail" {...swap} className="flex min-h-0 flex-1 flex-col px-6 pb-4">
                <CoinDetail symbol={selected} range={range} onRange={setRange} display={display} timeZone={timeZone} onBack={backToList} />
              </motion.div>
            ) : (
              <motion.div key="list" {...swap} className="flex min-h-0 flex-1 flex-col">
                <WindowScroll className="px-3!">
                  <CoinList display={display} selected={selected} onSelect={onSelect} onOpen={() => setView("detail")} />
                </WindowScroll>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          // Desktop: lista i wykres obok siebie; przewijanie tylko awaryjnie (bardzo niskie ekrany).
          <WindowScroll className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-[calc(var(--u)*2)] pt-1">
            <CoinList display={display} selected={selected} onSelect={onSelect} onOpen={() => undefined} />
            <CoinDetail symbol={selected} range={range} onRange={setRange} display={display} timeZone={timeZone} />
          </WindowScroll>
        )}
      </div>
      <div
        role="tabpanel"
        id={tabPanelId(TABS_ID, "alerts")}
        aria-labelledby={tabId(TABS_ID, "alerts")}
        hidden={tab !== "alerts"}
        className="flex min-h-0 flex-1 flex-col lg:absolute lg:inset-0"
      >
        {tab === "alerts" && (
          <WindowScroll>
            <AlertsTab display={display} selected={selected} timeZone={timeZone} />
          </WindowScroll>
        )}
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<QuoteSource, string> = { binance: "Binance", coingecko: "CoinGecko", demo: "demo" };

const DOT: Record<FeedStatus, string> = {
  idle: "bg-white/50",
  connecting: "bg-amber",
  live: "bg-[#4ade80]",
  reconnecting: "bg-amber",
  fallback: "bg-amber",
  offline: "bg-[#f87171]",
};

/** Kapsuła pod oknem: stan połączenia, źródło, czas aktualizacji, kurs NBP przy PLN. */
function MarketsStatus({ display, timeZone }: { display: Display; timeZone: string }) {
  const status = useMarketsStore((state) => state.status);
  const source = useMarketsStore((state) => state.source);
  const receivedAt = useMarketsStore((state) => state.receivedAt);
  const label = FEED_STATUS_LABELS[status];
  const fxDate = display.currency === "PLN" && display.fx ? display.fx.effectiveDate.split("-").reverse().slice(0, 2).join(".") : null;

  return (
    <StatusCapsule>
      <span className="flex items-center gap-2 whitespace-nowrap text-text-primary" data-testid="markets-status" data-status={status}>
        <span aria-hidden data-pulse={status === "reconnecting" || status === "connecting" || undefined} className={`market-dot size-2 rounded-full ${DOT[status]}`} />
        {label.charAt(0).toUpperCase() + label.slice(1)}
        {source && <span className="text-text-secondary">· {SOURCE_LABELS[source]}</span>}
      </span>
      {receivedAt && (
        <span className="whitespace-nowrap tabular-nums">
          <span aria-hidden>· </span>
          {formatTime(new Date(receivedAt), timeZone)}
        </span>
      )}
      {fxDate && (
        <span className="whitespace-nowrap tabular-nums">
          <span aria-hidden>· </span>kurs NBP z {fxDate}
        </span>
      )}
    </StatusCapsule>
  );
}
