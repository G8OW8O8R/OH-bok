"use client";

import { useEffect, useState } from "react";
import { onBootDone } from "@/lib/boot";

/** Najpóźniej po tym czasie od końca startu praca „na później” i tak rusza. */
const IDLE_TIMEOUT_MS = 2000;

/**
 * true w pierwszej bezczynnej chwili po końcu sekwencji startu. Do tego czasu pulpit
 * nie wczytuje rzeczy potrzebnych dopiero na żądanie (kod okien, Spotlight), żeby nie
 * konkurowały z hydracją i pierwszymi klatkami o wątek główny.
 */
export function useIdleAfterBoot(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let cancel = () => {};
    const off = onBootDone(() => {
      if ("requestIdleCallback" in window) {
        const handle = window.requestIdleCallback(() => setIdle(true), { timeout: IDLE_TIMEOUT_MS });
        cancel = () => window.cancelIdleCallback(handle);
      } else {
        // Safari bez requestIdleCallback: po chwili od końca startu.
        const handle = setTimeout(() => setIdle(true), 300);
        cancel = () => clearTimeout(handle);
      }
    });
    return () => {
      off();
      cancel();
    };
  }, []);
  return idle;
}
