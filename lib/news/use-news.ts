"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { demoDigest } from "./demo";
import { newsDigestSchema, type NewsDigest } from "./schema";

/**
 * Wiadomości po stronie klienta: pobranie po hydracji (nie opóźnia SSR ani LCP – widget ma
 * stały rozmiar i szkielet), odświeżanie co 30 min, po powrocie do karty i po `online`.
 * Streszczenie w trakcie generowania → jedno ponowne zapytanie po 15 s.
 * Odpowiedź walidowana Zodem; bez sieci i bez danych – demo z oznaczeniem.
 */

export const NEWS_REFRESH_MS = 30 * 60 * 1000;
const SUMMARY_RETRY_MS = 15_000;

export type NewsStatus = "loading" | "ready";

export interface UseNewsResult {
  digest: NewsDigest | null;
  status: NewsStatus;
}

async function fetchDigest(signal: AbortSignal): Promise<NewsDigest | null> {
  try {
    const response = await fetch("/api/news", { signal });
    if (!response.ok) return null;
    const parsed = newsDigestSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function useNews(): UseNewsResult {
  const [digest, setDigest] = useState<NewsDigest | null>(null);
  const loadedAt = useRef(0);
  const retried = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const next = await fetchDigest(current.signal);
    if (current.signal.aborted) return;
    loadedAt.current = Date.now();
    // Nieudane zapytanie nie zastępuje dobrych danych; bez nich – demo.
    setDigest((previous) => next ?? previous ?? demoDigest(new Date()));
  }, []);

  // Streszczenie w trakcie generowania: jedno ponowne zapytanie (wynik będzie już w cache serwera).
  const pending = digest?.summaryPending ?? false;
  useEffect(() => {
    if (!pending || retried.current) return;
    retried.current = true;
    const timer = window.setTimeout(() => void load(), SUMMARY_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, load]);

  useEffect(() => {
    // Pierwsze pobranie tuż po hydracji (poza renderem i efektem – stan zmienia się dopiero po odpowiedzi).
    const first = window.setTimeout(() => void load(), 0);
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || Date.now() - loadedAt.current < NEWS_REFRESH_MS) return;
      retried.current = false;
      void load();
    };
    const onOnline = () => {
      retried.current = false;
      void load();
    };
    const interval = window.setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("online", onOnline);
    };
  }, [load]);

  return { digest, status: digest ? "ready" : "loading" };
}
