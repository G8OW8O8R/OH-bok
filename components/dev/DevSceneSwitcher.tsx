"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WEATHER_STATES, type WeatherState } from "@/lib/scenes";

interface DevSceneSwitcherProps {
  /** Aktywny override albo null = prawdziwa pogoda. */
  current: WeatherState | null;
}

const OPTIONS: ReadonlyArray<{ label: string; href: string; state: WeatherState | null }> = [
  { label: "na żywo", href: "/", state: null },
  ...WEATHER_STATES.map((state) => ({ label: state, href: `?weather=${state}`, state })),
];

const HIDDEN_KEY = "obok-dev-switcher-hidden";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Tylko w trybie dev: szybkie przełączanie `?weather=` nawigacją po stronie klienta (z przenikaniem).
 * Domyślnie widoczny; Shift+D ukrywa i pokazuje (stan w sessionStorage).
 */
export function DevSceneSwitcher({ current }: DevSceneSwitcherProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = sessionStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      // Brak dostępu do sessionStorage: zostaje widoczny.
    }
    const restore = window.setTimeout(() => setHidden(stored), 0);

    const onKey = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code !== "KeyD" || event.repeat || isTyping(event.target)) return;
      setHidden((was) => {
        try {
          sessionStorage.setItem(HIDDEN_KEY, was ? "0" : "1");
        } catch {
          // Tylko wygoda: bez zapisu stan przetrwa do przeładowania.
        }
        return !was;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(restore);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (hidden) return null;

  return (
    <nav
      aria-label="Scena (dev)"
      className="fixed right-4 bottom-4 flex gap-1 rounded-pill border border-glass-border bg-glass p-1 text-xs backdrop-blur-xl"
    >
      {OPTIONS.map(({ label, href, state }) => (
        <Link
          key={label}
          href={href}
          replace
          scroll={false}
          aria-current={state === current ? "page" : undefined}
          className="rounded-pill px-2.5 py-1 text-text-secondary transition-colors duration-(--dur-feedback) hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber aria-[current=page]:bg-white/10 aria-[current=page]:text-amber"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
