"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ALERTS_STORAGE_KEY, useAlertsStore } from "@/store/alerts";
import { MARKETS_STORAGE_KEY, useMarketsStore } from "@/store/markets";
import { alertMessage, isPending } from "./alerts";
import { MarketFeed } from "./feed";
import { parseFeedMode } from "./feed-machine";
import { FX_RETRY_S, isFxFresh, usableFx } from "./fx";
import { fxRateSchema } from "./schema";

/**
 * Rynki po stronie klienta: wspólny kanał cen (jeden na kartę, liczone subskrypcje),
 * kurs USD/PLN i alerty cenowe. Kanał działa tylko, gdy ktoś go potrzebuje: oczekujący alert,
 * okno Rynków (9b) albo podgląd dev.
 */

let hydration: Promise<void> | null = null;

/** Wczytanie `obok-markets` i `obok-alerts` po hydracji (raz) + zgodność między kartami. */
export function ensureMarketsHydrated(): Promise<void> {
  if (hydration) return hydration;
  hydration = Promise.all([useMarketsStore.persist.rehydrate(), useAlertsStore.persist.rehydrate()]).then(() => {
    window.addEventListener("storage", (event) => {
      if (event.key === MARKETS_STORAGE_KEY) void useMarketsStore.persist.rehydrate();
      if (event.key === ALERTS_STORAGE_KEY) void useAlertsStore.persist.rehydrate();
    });
  });
  return hydration;
}

/** true, gdy zapisane preferencje i alerty są wczytane. */
export function useMarketsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void ensureMarketsHydrated().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

/** Krótka zwłoka przed zatrzymaniem: StrictMode i szybkie zamknięcie/otwarcie okna nie zrywają gniazda. */
const STOP_GRACE_MS = 2000;

let feed: MarketFeed | null = null;
let subscribers = 0;
let stopTimer: number | undefined;

function browserFeed(): MarketFeed {
  if (feed) return feed;
  const store = useMarketsStore.getState;
  feed = new MarketFeed({
    // Dev override `?markets=fallback|offline` (test przełączania źródeł bez blokowania Binance).
    mode: parseFeedMode(new URLSearchParams(window.location.search).get("markets")),
    createSocket: (url) => new WebSocket(url),
    fetch: (...args) => fetch(...args),
    scheduler: {
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (handle) => window.clearTimeout(handle),
    },
    random: Math.random,
    isOnline: () => navigator.onLine,
    watchNetwork: (listener) => {
      const online = () => listener(true);
      const offline = () => listener(false);
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    },
    onQuotes: (batch) => store().applyQuotes(batch, new Date()),
    onState: (state) => store().setStatus(state.status),
  });
  return feed;
}

function subscribeFeed(): () => void {
  const instance = browserFeed();
  subscribers += 1;
  window.clearTimeout(stopTimer);
  instance.start();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers -= 1;
    if (subscribers > 0) return;
    stopTimer = window.setTimeout(() => {
      if (subscribers === 0) instance.stop();
    }, STOP_GRACE_MS);
  };
}

/** Ceny na żywo, dopóki `active` (komponent może zapisać się warunkowo). */
export function useMarketFeed(active: boolean): void {
  useEffect(() => (active ? subscribeFeed() : undefined), [active]);
}

/**
 * Kurs USD/PLN z `/api/fx`, dopóki `active`. Aktualny kurs z pamięci nie jest pobierany ponownie;
 * kolejne pobranie po publikacji następnej tabeli NBP, po błędzie co 15 min i po powrocie sieci.
 */
export function useFxRate(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      // setTimeout przyjmuje najwyżej ~24,8 dnia; dalej i tak sprawdzamy ponownie.
      timer = window.setTimeout(() => void load(), Math.min(Math.max(ms, 1000), 2 ** 31 - 1));
    };

    const load = async () => {
      await ensureMarketsHydrated();
      if (cancelled) return;
      const stored = useMarketsStore.getState().fx;
      if (stored && isFxFresh(stored, new Date())) {
        schedule(Date.parse(stored.validUntil) - Date.now());
        return;
      }
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/fx", { signal: controller.signal });
        const parsed = response.ok ? fxRateSchema.safeParse(await response.json()) : null;
        if (cancelled) return;
        if (parsed?.success) {
          useMarketsStore.getState().setFx(parsed.data);
          if (isFxFresh(parsed.data, new Date())) {
            schedule(Date.parse(parsed.data.validUntil) - Date.now());
            return;
          }
        }
      } catch {
        // Brak sieci: zostaje ostatni znany kurs (albo tylko USD).
      }
      if (!cancelled) schedule(FX_RETRY_S * 1000);
    };

    const online = () => void load();
    window.addEventListener("online", online);
    void load();
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [active]);
}

/**
 * Alerty cenowe na pulpicie: kanał cen działa, gdy jest oczekujący alert; każda paczka cen
 * sprawdza alerty, a spełnione trafiają do pigułki (`announce`).
 */
export function useMarketAlerts(announce: (message: string) => void): void {
  const ready = useMarketsReady();
  // Selektory zwracają wartości proste: nowa tablica przy każdym odczycie zapętlałaby render.
  const hasPending = useAlertsStore((state) => state.alerts.some(isPending));
  const hasPendingPln = useAlertsStore((state) => state.alerts.some((alert) => isPending(alert) && alert.currency === "PLN"));
  const watching = ready && hasPending;
  const needsFx = watching && hasPendingPln;

  useMarketFeed(watching);
  useFxRate(needsFx);

  const notify = useEffectEvent((message: string) => announce(message));

  useEffect(() => {
    if (!watching) return;
    return useMarketsStore.subscribe((state, previous) => {
      if (state.quotes === previous.quotes) return;
      const now = new Date();
      const rate = usableFx(state.fx, now)?.rate ?? null;
      const message = alertMessage(useAlertsStore.getState().check(state.quotes, rate, now));
      if (message) notify(message);
    });
  }, [watching]);
}
