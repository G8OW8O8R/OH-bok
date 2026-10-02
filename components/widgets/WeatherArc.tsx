"use client";

import { LocateFixed } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Glass } from "@/components/ui/Glass";
import { WEATHER_LABELS, weatherLabel, type WeatherState } from "@/lib/scenes";
import { dateIn, formatTime } from "@/lib/time";
import type { WeatherData } from "@/lib/weather/schema";
import { TemperatureCurve } from "./TemperatureCurve";

interface WeatherArcProps {
  weather: WeatherData;
  /** Scena wymuszona przez `?weather=`; etykieta o niej tylko w trybie dev (jak przełącznik scen). */
  override: WeatherState | null;
  locating: boolean;
  locationError: string | null;
  onLocate: () => void;
  now: Date;
  /** Strefa użytkownika (godzina „z pamięci”). */
  timeZone: string;
  called: boolean;
  /** Dzień przypięty do podglądu w kuli. */
  pinnedDay: string | null;
  /** Najechanie / fokus na dzień prognozy (null = wyjście): podgląd w kuli. */
  onHoverDay: (date: string | null) => void;
  onTogglePin: (date: string) => void;
}

const noopSubscribe = () => () => {};
/** true dopiero w przeglądarce: przed hydracją kliknięcie „lokalizuj” by przepadło. */
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius);
  return `${rounded === 0 ? 0 : rounded}°`;
}

const chip = "rounded-pill bg-white/10 px-2.5 py-0.5 text-micro text-text-primary";

/**
 * Łuk pogody (daleko): temperatura, stan, miejsce, mini krzywa 5 dni z prawdziwej prognozy,
 * źródło danych (z pamięci / demo), zgoda na lokalizację i atrybucja Open-Meteo.
 */
export function WeatherArc({
  weather,
  override,
  locating,
  locationError,
  onLocate,
  now,
  timeZone,
  called,
  pinnedDay,
  onHoverDay,
  onTogglePin,
}: WeatherArcProps) {
  const isClient = useIsClient();
  const { current, location, source } = weather;
  const place = location.isDefault ? "Gdańsk" : "Twoja lokalizacja";

  return (
    <div className="relative mb-7 desk:mb-0">
      <Glass
        depth="far"
        role="region"
        aria-label="Pogoda"
        id="weather"
        tabIndex={-1}
        data-testid="weather-arc"
        data-source={source}
        data-called={called || undefined}
        className="shape-arch flex h-108.75 flex-col items-center justify-between px-5 pt-22 pb-5 text-center [--arch-width:calc(var(--u)*14.5)]"
      >
        <div className="flex flex-col items-center">
          <p className="text-temp font-medium text-text-primary tabular-nums">
            {formatTemperature(current.temperatureC)}
          </p>
          <p className="mt-4 text-title font-medium text-text-primary">{weatherLabel(current.state, current.isDay)}</p>
          <p className="flex items-center gap-1.5 text-title text-text-secondary">
            <span data-testid="weather-place">{place}</span>
            {location.isDefault && (
              <button
                type="button"
                onClick={onLocate}
                disabled={!isClient || locating}
                aria-label="Użyj mojej lokalizacji"
                title="Użyj mojej lokalizacji"
                className="-m-1 grid size-8 place-items-center rounded-full text-text-secondary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary disabled:opacity-60"
              >
                <LocateFixed aria-hidden className={`size-4.5 ${locating ? "animate-pulse" : ""}`} strokeWidth={1.75} />
              </button>
            )}
          </p>

          <div role="status" aria-live="polite" className="mt-2 flex flex-wrap justify-center gap-1.5 empty:hidden">
            {source === "cache" && (
              <span className={chip} data-testid="weather-badge">
                z pamięci · {formatTime(new Date(weather.fetchedAt), timeZone)}
              </span>
            )}
            {source === "demo" && (
              <span className={`${chip} tracking-wide uppercase`} data-testid="weather-badge">
                demo
              </span>
            )}
            {locating && <span className={chip}>Ustalam lokalizację…</span>}
            {locationError && <span className={chip}>{locationError}</span>}
            {override && process.env.NODE_ENV === "development" && <span className={chip}>Scena wymuszona: {WEATHER_LABELS[override].toLowerCase()}</span>}
          </div>
        </div>

        <div className="w-full px-1">
          <p className="sr-only">Prognoza na {weather.daily.length} dni</p>
          <TemperatureCurve
            days={weather.daily}
            today={dateIn(now, weather.timezone)}
            pinnedDay={pinnedDay}
            onHoverDay={onHoverDay}
            onTogglePin={onTogglePin}
          />
        </div>
      </Glass>

      <p className="scene-text absolute top-full left-1/2 mt-2 -translate-x-1/2 text-center text-micro whitespace-nowrap text-text-secondary">
        Dane pogodowe:{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-white/40 underline-offset-2 hover:text-text-primary"
        >
          Open-Meteo.com
        </a>
      </p>
    </div>
  );
}
