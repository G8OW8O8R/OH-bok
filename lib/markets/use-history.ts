"use client";

import { useCallback, useEffect, useState } from "react";
import { HISTORY_RANGE_CONFIG } from "./history";
import { marketHistorySchema, type HistoryRange, type MarketHistory } from "./schema";
import type { MarketSymbol } from "./symbols";

/**
 * Historia z `/api/markets/history` po stronie klienta: pamięć na czas życia cache zakresu
 * (1D 5 min, 1T 30 min, 1M 2 h) i jedno zapytanie w locie na klucz. Sparkline'y (1D) i wykres
 * korzystają z tych samych danych.
 */
interface Entry {
  data: MarketHistory;
  expires: number;
}

const memory = new Map<string, Entry>();
const inFlight = new Map<string, Promise<MarketHistory | null>>();

const keyOf = (symbol: MarketSymbol, range: HistoryRange) => `${symbol}:${range}`;

function cached(key: string): MarketHistory | null {
  const entry = memory.get(key);
  return entry && entry.expires > Date.now() ? entry.data : null;
}

function load(symbol: MarketSymbol, range: HistoryRange): Promise<MarketHistory | null> {
  const key = keyOf(symbol, range);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetch(`/api/markets/history?symbol=${symbol}&range=${range}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((json: unknown) => {
      const parsed = marketHistorySchema.safeParse(json);
      if (!parsed.success) return null;
      // Dane demo krócej: przy następnym otwarciu może już być prawdziwe źródło.
      const ttl = parsed.data.source === "demo" ? 30_000 : HISTORY_RANGE_CONFIG[range].revalidateS * 1000;
      memory.set(key, { data: parsed.data, expires: Date.now() + ttl });
      return parsed.data;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Ciche pobranie z wyprzedzeniem (np. pozostałe zakresy wybranej waluty): przełączenie bez czekania. */
export function prefetchHistory(symbol: MarketSymbol, range: HistoryRange): void {
  if (!cached(keyOf(symbol, range))) void load(symbol, range);
}

export type HistoryStatus = "loading" | "ready" | "error";

export interface UseHistoryResult {
  data: MarketHistory | null;
  status: HistoryStatus;
  retry: () => void;
}

export function useMarketHistory(symbol: MarketSymbol, range: HistoryRange): UseHistoryResult {
  const key = keyOf(symbol, range);
  const [state, setState] = useState<{ key: string; data: MarketHistory | null; failed: boolean }>(() => ({
    key,
    data: cached(key),
    failed: false,
  }));
  const [attempt, setAttempt] = useState(0);

  // Nowy klucz: od razu dane z pamięci (bez migania „ładowania”), inaczej czekamy na zapytanie.
  if (state.key !== key) setState({ key, data: cached(key), failed: false });

  useEffect(() => {
    if (cached(key)) return;
    let cancelled = false;
    void load(symbol, range).then((data) => {
      if (!cancelled) setState({ key, data, failed: data === null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, symbol, range, attempt]);

  const retry = useCallback(() => {
    setState({ key, data: null, failed: false });
    setAttempt((value) => value + 1);
  }, [key]);

  const data = state.key === key ? state.data : cached(key);
  return { data, status: data ? "ready" : state.failed ? "error" : "loading", retry };
}
