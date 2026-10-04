"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createAlert,
  evaluateAlerts,
  MAX_ALERTS,
  priceAlertSchema,
  type AlertInput,
  type PriceAlert,
} from "@/lib/markets/alerts";
import type { Quote } from "@/lib/markets/schema";
import type { MarketSymbol } from "@/lib/markets/symbols";

interface AlertsState {
  alerts: PriceAlert[];
  /** Dodaje alert; false, gdy osiągnięto limit. */
  add: (input: AlertInput, now: Date) => boolean;
  remove: (id: string) => void;
  /** Ocena przy paczce cen: oznacza spełnione alerty i je zwraca. */
  check: (quotes: Partial<Record<MarketSymbol, Quote>>, usdPln: number | null, now: Date) => PriceAlert[];
}

export const ALERTS_STORAGE_KEY = "obok-alerts";

const persistedSchema = z.object({ alerts: z.array(priceAlertSchema).max(MAX_ALERTS) });
type PersistedAlerts = z.infer<typeof persistedSchema>;

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],
      add: (input, now) => {
        const { alerts } = get();
        if (alerts.length >= MAX_ALERTS) return false;
        set({ alerts: [...alerts, createAlert(input, `alert-${crypto.randomUUID()}`, now)] });
        return true;
      },
      remove: (id) => set({ alerts: get().alerts.filter((alert) => alert.id !== id) }),
      check: (quotes, usdPln, now) => {
        const { alerts, triggered } = evaluateAlerts(get().alerts, quotes, usdPln, now);
        if (triggered.length > 0) set({ alerts });
        return triggered;
      },
    }),
    {
      name: ALERTS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ alerts }): PersistedAlerts => ({ alerts }),
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      skipHydration: true,
    },
  ),
);
