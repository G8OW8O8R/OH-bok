"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ORB_MODES, ORB_STATES, type OrbMode, type OrbState } from "@/lib/orb/states";
import { WEATHER_STATES, type WeatherState } from "@/lib/scenes";

interface DevOverrides {
  /** Aktywny override albo null = prawdziwa pogoda. */
  weather: WeatherState | null;
  orbState: OrbState | null;
  orbMode: OrbMode | null;
}

type DevSceneSwitcherProps = DevOverrides;

/** Adres z nadpisanym jednym parametrem; pozostałe override'y zostają. */
function hrefWith(current: DevOverrides, patch: Partial<DevOverrides>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.weather) params.set("weather", next.weather);
  if (next.orbState && next.orbState !== "idle") params.set("orb", next.orbState);
  if (next.orbMode) params.set("orb-mode", next.orbMode);
  const query = params.toString();
  return query ? `?${query}` : "/";
}

const link =
  "rounded-pill px-2.5 py-1 text-text-secondary transition-colors duration-(--dur-feedback) hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber aria-[current=page]:bg-white/10 aria-[current=page]:text-amber";

const HIDDEN_KEY = "obok-dev-switcher-hidden";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Tylko w trybie dev: szybkie przełączanie `?weather=` nawigacją po stronie klienta (z przenikaniem).
 * Domyślnie widoczny; Shift+D ukrywa i pokazuje (stan w sessionStorage).
 */
export function DevSceneSwitcher({ weather, orbState, orbMode }: DevSceneSwitcherProps) {
  const current: DevOverrides = { weather, orbState, orbMode };
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

  const scenes: ReadonlyArray<{ label: string; value: WeatherState | null }> = [
    { label: "na żywo", value: null },
    ...WEATHER_STATES.map((state) => ({ label: state, value: state })),
  ];
  const modes: ReadonlyArray<{ label: string; value: OrbMode | null }> = [
    { label: "auto", value: null },
    ...ORB_MODES.map((mode) => ({ label: mode, value: mode })),
  ];

  return (
    <div className="fixed right-4 bottom-4 flex flex-col items-end gap-1.5 text-xs">
      <nav aria-label="Kula (dev)" className="flex gap-1 rounded-pill border border-glass-border bg-glass p-1 backdrop-blur-xl">
        {ORB_STATES.map((state) => (
          <Link
            key={state}
            href={hrefWith(current, { orbState: state })}
            replace
            scroll={false}
            aria-current={(orbState ?? "idle") === state ? "page" : undefined}
            className={link}
          >
            {state}
          </Link>
        ))}
        <span aria-hidden className="mx-1 w-px self-stretch bg-white/15" />
        {modes.map(({ label, value }) => (
          <Link
            key={label}
            href={hrefWith(current, { orbMode: value })}
            replace
            scroll={false}
            aria-current={value === orbMode ? "page" : undefined}
            className={link}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Scena (dev)" className="flex gap-1 rounded-pill border border-glass-border bg-glass p-1 backdrop-blur-xl">
        {scenes.map(({ label, value }) => (
          <Link
            key={label}
            href={hrefWith(current, { weather: value })}
            replace
            scroll={false}
            aria-current={value === weather ? "page" : undefined}
            className={link}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
