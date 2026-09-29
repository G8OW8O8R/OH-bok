"use client";

import { useSyncExternalStore } from "react";
import { WEATHER_LABELS, weatherLabel, type WeatherState } from "@/lib/scenes";
import type { WeatherData } from "@/lib/weather/schema";

interface WeatherCapsuleProps {
  weather: WeatherData;
  /** Scena wymuszona przez `?weather=` (dev override). */
  override: WeatherState | null;
  locating: boolean;
  locationError: string | null;
  onLocate: () => void;
}

const noopSubscribe = () => () => {};
/** true dopiero w przeglądarce: godziny formatujemy w strefie użytkownika, nie serwera. */
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const timeFormat = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });

function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/**
 * Tymczasowa kapsuła pogody (zalążek łuku pogody): miejsce, temperatura, stan,
 * źródło danych (cache / demo), zgoda na lokalizację i atrybucja Open-Meteo.
 */
export function WeatherCapsule({ weather, override, locating, locationError, onLocate }: WeatherCapsuleProps) {
  const isClient = useIsClient();
  const { current, location, source } = weather;
  const place = location.isDefault ? "Gdańsk" : "Twoja lokalizacja";

  return (
    <section
      aria-label="Pogoda"
      data-testid="weather-capsule"
      data-source={source}
      className="glass fixed top-6 left-6 flex max-w-[calc(100vw-3rem)] flex-col gap-3 rounded-widget px-6 py-5"
    >
      <div className="flex items-center gap-4">
        <p className="text-5xl leading-none font-light tracking-tight tabular-nums">
          {formatTemperature(current.temperatureC)}
        </p>
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium">{weatherLabel(current.state, current.isDay)}</p>
          <p className="text-sm text-text-secondary" data-testid="weather-place">
            {place}
          </p>
        </div>
      </div>

      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs empty:hidden">
        {source === "cache" && (
          <span className="rounded-pill bg-white/10 px-2.5 py-1 text-text-secondary" data-testid="weather-badge">
            z pamięci{isClient ? ` · ${timeFormat.format(new Date(weather.fetchedAt))}` : ""}
          </span>
        )}
        {source === "demo" && (
          <span
            className="rounded-pill bg-white/10 px-2.5 py-1 tracking-wide text-text-secondary uppercase"
            data-testid="weather-badge"
          >
            demo
          </span>
        )}
        {locationError && <span className="text-text-secondary">{locationError}</span>}
      </div>

      {location.isDefault && (
        <button
          type="button"
          onClick={onLocate}
          // Przed hydracją kliknięcie by przepadło: przycisk czeka na JS zamiast udawać, że działa.
          disabled={!isClient || locating}
          className="self-start rounded-pill border border-glass-border px-3.5 py-1.5 text-sm text-text-primary transition-colors duration-(--dur-feedback) hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:opacity-60"
        >
          {locating ? "Ustalam lokalizację…" : "Użyj mojej lokalizacji"}
        </button>
      )}

      {override && (
        <p className="text-xs text-text-tertiary">Scena wymuszona: {WEATHER_LABELS[override].toLowerCase()}</p>
      )}

      <p className="text-xs text-text-tertiary">
        Dane pogodowe:{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-white/30 underline-offset-2 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-amber"
        >
          Open-Meteo.com
        </a>
      </p>
    </section>
  );
}
