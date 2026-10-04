"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { currencySchema, type Currency } from "@/lib/markets/currency";
import type { FeedStatus } from "@/lib/markets/feed-machine";
import { fxRateSchema, type FxRate, type Quote, type QuoteSource } from "@/lib/markets/schema";
import type { MarketSymbol } from "@/lib/markets/symbols";

interface MarketsState {
  /** Ostatnie notowanie każdego symbolu (ze źródła w `quote.source`). */
  quotes: Partial<Record<MarketSymbol, Quote>>;
  status: FeedStatus;
  /** Źródło ostatniej paczki cen. */
  source: QuoteSource | null;
  /** Chwila odebrania ostatniej paczki (ISO). */
  receivedAt: string | null;
  /** Waluta wyświetlania (zapamiętana). */
  currency: Currency;
  /** Ostatni kurs USD/PLN z NBP (zapamiętany: łagodna degradacja bez sieci). */
  fx: FxRate | null;
  applyQuotes: (batch: Quote[], receivedAt: Date) => void;
  /** Migawka startowa: uzupełnia tylko brakujące symbole, nie zmienia źródła ani czasu. */
  seedQuotes: (quotes: Quote[]) => void;
  setStatus: (status: FeedStatus) => void;
  setCurrency: (currency: Currency) => void;
  setFx: (fx: FxRate) => void;
}

export const MARKETS_STORAGE_KEY = "obok-markets";

const persistedSchema = z.object({
  currency: currencySchema,
  fx: fxRateSchema.nullable(),
});

type PersistedMarkets = z.infer<typeof persistedSchema>;

/** Nowszy z dwóch kursów (zapis z innej karty nie cofa świeżo pobranego). */
function newerFx(a: FxRate | null, b: FxRate | null): FxRate | null {
  if (!a || !b) return a ?? b;
  return Date.parse(b.fetchedAt) > Date.parse(a.fetchedAt) ? b : a;
}

export const useMarketsStore = create<MarketsState>()(
  persist(
    (set, get) => ({
      quotes: {},
      status: "idle",
      source: null,
      receivedAt: null,
      currency: "USD",
      fx: null,
      applyQuotes: (batch, receivedAt) => {
        const quotes = { ...get().quotes };
        let applied: Quote | null = null;
        for (const quote of batch) {
          // Ceny demo nigdy nie zastępują prawdziwych (nawet starszych).
          const previous = quotes[quote.symbol];
          if (quote.source === "demo" && previous && previous.source !== "demo") continue;
          quotes[quote.symbol] = quote;
          applied = quote;
        }
        if (applied) set({ quotes, source: applied.source, receivedAt: receivedAt.toISOString() });
      },
      seedQuotes: (seed) => {
        const missing = seed.filter((quote) => !get().quotes[quote.symbol]);
        if (missing.length > 0) set({ quotes: { ...get().quotes, ...Object.fromEntries(missing.map((quote) => [quote.symbol, quote])) } });
      },
      setStatus: (status) => set({ status }),
      setCurrency: (currency) => set({ currency }),
      setFx: (fx) => set({ fx: newerFx(get().fx, fx) }),
    }),
    {
      name: MARKETS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ currency, fx }): PersistedMarkets => ({ currency, fx }),
      // localStorage to dane z zewnątrz: uszkodzony zapis = stan domyślny.
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        if (!parsed.success) return current;
        return { ...current, currency: parsed.data.currency, fx: newerFx(current.fx, parsed.data.fx) };
      },
      skipHydration: true,
    },
  ),
);
