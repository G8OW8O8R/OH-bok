"use client";

import { useEffect, useRef, useState } from "react";
import { isBootDone, onBootDone } from "@/lib/boot";
import { demoFrame, demoScript, nextDemoChange, type DemoFrame } from "./script";

/** Klik, który zakończył demo, nie trafia do pulpitu (jak wybudzenie wygaszacza). */
const SWALLOW_CLICK_MS = 800;

/**
 * Silnik trybu demo: klatka scenariusza dla bieżącej chwili, budzenie tylko przy następnej zmianie.
 * Start po końcu sekwencji startu. Pierwsza interakcja użytkownika (klawisz, klik, dotyk, kółko)
 * kończy demo (`onExit`); sam ruch myszy nie – drgnięcie ręki nie przerywa wycieczki.
 */
export function useDemoTour(enabled: boolean, reduceMotion: boolean, onExit: () => void): DemoFrame | null {
  const [frame, setFrame] = useState<DemoFrame | null>(null);
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    if (!enabled) return;
    const steps = demoScript(reduceMotion);
    let timer = 0;
    let start = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      setFrame(demoFrame(steps, elapsed));
      timer = window.setTimeout(tick, Math.max(16, nextDemoChange(steps, elapsed) - elapsed));
    };
    const begin = () => {
      start = performance.now();
      timer = window.setTimeout(tick, 0);
    };
    let unsubscribe = () => {};
    if (isBootDone()) begin();
    else unsubscribe = onBootDone(begin);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [enabled, reduceMotion]);

  useEffect(() => {
    if (!enabled) return;
    let swallowUntil = 0;
    const end = (event: Event) => {
      // Zdarzenia wysłane przez skrypt (np. przez samą wycieczkę) nie są interakcją.
      if (!event.isTrusted) return;
      if (event.type !== "wheel") event.preventDefault();
      event.stopPropagation();
      if (event.type === "pointerdown" || event.type === "touchstart") swallowUntil = performance.now() + SWALLOW_CLICK_MS;
      exitRef.current();
    };
    const swallowClick = (event: MouseEvent) => {
      if (performance.now() > swallowUntil) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const options = { capture: true, passive: false } as const;
    window.addEventListener("keydown", end, options);
    window.addEventListener("pointerdown", end, options);
    window.addEventListener("touchstart", end, options);
    window.addEventListener("wheel", end, { capture: true, passive: true });
    window.addEventListener("click", swallowClick, true);
    return () => {
      window.removeEventListener("keydown", end, options);
      window.removeEventListener("pointerdown", end, options);
      window.removeEventListener("touchstart", end, options);
      window.removeEventListener("wheel", end, { capture: true });
      // Klik po zakończeniu demo dalej pochłaniany przez chwilę: słuchacz zostaje do końca okna.
      window.setTimeout(() => window.removeEventListener("click", swallowClick, true), SWALLOW_CLICK_MS);
    };
  }, [enabled]);

  return enabled ? frame : null;
}
