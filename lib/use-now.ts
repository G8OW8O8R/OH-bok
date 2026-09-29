"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const TICK_MS = 10_000;

/**
 * Bieżąca chwila, odświeżana co 10 s. Startuje od czasu renderu na serwerze,
 * więc hydracja widzi te same godziny co HTML.
 */
export function useNow(initial: string): Date {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

const noopSubscribe = () => () => {};

/**
 * Strefa czasowa użytkownika. Serwer jej nie zna, więc SSR i hydracja używają
 * `fallback` (strefa lokalizacji pogody), a zaraz potem przechodzimy na strefę przeglądarki.
 */
export function useUserTimeZone(fallback: string): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => fallback,
  );
}
