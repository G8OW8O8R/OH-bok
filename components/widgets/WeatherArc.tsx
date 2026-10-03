"use client";

import { LocateFixed, Navigation2, Undo2, Umbrella } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useSyncExternalStore } from "react";
import { Glass } from "@/components/ui/Glass";
import { duration, ease } from "@/lib/motion";
import { compassDirection } from "@/lib/scene-conditions";
import { WEATHER_LABELS, weatherLabel, type WeatherState } from "@/lib/scenes";
import { dateIn, formatTime, weekdayLong } from "@/lib/time";
import type { DailyForecast, WeatherData } from "@/lib/weather/schema";
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
  /** Kliknięty dzień (podróż w czasie): łuk pokazuje jego szczegóły; null = dziś. */
  selectedDay: DailyForecast | null;
  /** Najechanie / fokus na dzień prognozy (null = wyjście): podgląd w kuli. */
  onHoverDay: (date: string | null) => void;
  /** Klik dnia: scena i szczegóły tego dnia (klik dziś albo ponowny = powrót). */
  onSelectDay: (date: string) => void;
  onReturnToday: () => void;
}

const noopSubscribe = () => () => {};
/** true dopiero w przeglądarce: przed hydracją kliknięcie „lokalizuj” by przepadło. */
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function formatTemperature(celsius: number | null): string {
  if (celsius === null) return "–";
  const rounded = Math.round(celsius);
  return `${rounded === 0 ? 0 : rounded}°`;
}

function formatMm(mm: number): string {
  return `${mm.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} mm`;
}

/** „80% · 4,2 mm”; bez prawdopodobieństwa (starsze dane) sama suma opadu. */
function formatPrecipitation(day: DailyForecast): string {
  const sum = day.precipitationSumMm;
  if (day.precipitationProbabilityMax === null) return sum === null ? "brak danych" : formatMm(sum);
  const amount = sum !== null && sum >= 0.1 ? ` · ${formatMm(sum)}` : "";
  return `${Math.round(day.precipitationProbabilityMax)}%${amount}`;
}

/** Odpowiednik tekstowy szczegółów dnia dla czytników ekranu. */
function dayAnnouncement(day: DailyForecast): string {
  const parts = [
    `${weekdayLong(day.date)}: ${WEATHER_LABELS[day.state].toLowerCase()}`,
    `do ${formatTemperature(day.temperatureMaxC)}, od ${formatTemperature(day.temperatureMinC)}`,
  ];
  if (day.precipitationProbabilityMax !== null) parts.push(`szansa opadów ${Math.round(day.precipitationProbabilityMax)}%`);
  if (day.windMaxKmh !== null) {
    const from = day.windDirectionDeg === null ? "" : ` ${compassDirection(day.windDirectionDeg).long}`;
    parts.push(`wiatr${from} do ${Math.round(day.windMaxKmh)} km/h`);
  }
  return parts.join(", ");
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
  selectedDay,
  onHoverDay,
  onSelectDay,
  onReturnToday,
}: WeatherArcProps) {
  const isClient = useIsClient();
  const reduceMotion = useReducedMotion();
  const curveRef = useRef<HTMLDivElement>(null);
  const { current, location, source } = weather;
  const place = location.isDefault ? "Gdańsk" : "Twoja lokalizacja";
  const today = dateIn(now, weather.timezone);
  // Krótkie przenikanie treści łuku; wysokość łuku stała, więc krzywa nie skacze.
  const swap = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -4 },
    transition: { duration: reduceMotion ? duration.reducedFade / 2 : 0.16, ease: ease.soft },
  };

  const returnToday = () => {
    onReturnToday();
    // Przycisk znika: fokus na „dziś” w prognozie zamiast zgubienia go na <body>.
    requestAnimationFrame(() => curveRef.current?.querySelector<HTMLElement>("[data-today]")?.focus({ preventScroll: true }));
  };

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
        <AnimatePresence mode="wait" initial={false}>
          {selectedDay ? (
            <motion.div key={selectedDay.date} {...swap} className="flex flex-col items-center" data-testid="weather-day-details">
              <p className="text-temp font-medium text-text-primary tabular-nums">
                {formatTemperature(selectedDay.temperatureMaxC)}
                <span className="text-lead font-normal tracking-normal text-text-secondary">
                  {" / "}
                  {formatTemperature(selectedDay.temperatureMinC)}
                </span>
              </p>
              <p className="mt-4 text-title font-medium text-text-primary">
                {weekdayLong(selectedDay.date)} · {WEATHER_LABELS[selectedDay.state].toLowerCase()}
              </p>
              <dl className="mt-1 flex items-center gap-4 text-caption text-text-secondary tabular-nums">
                <div className="flex items-center gap-1.5">
                  <dt>
                    <Umbrella aria-hidden className="size-4" strokeWidth={1.75} />
                    <span className="sr-only">Szansa opadów</span>
                  </dt>
                  <dd data-testid="day-precipitation">{formatPrecipitation(selectedDay)}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt>
                    {/* Strzałka wskazuje, dokąd wieje (kierunek meteorologiczny + 180°). */}
                    <Navigation2
                      aria-hidden
                      className="size-4"
                      strokeWidth={1.75}
                      style={{
                        rotate: `${(selectedDay.windDirectionDeg ?? 0) + 180}deg`,
                        opacity: selectedDay.windDirectionDeg === null ? 0 : 1,
                      }}
                    />
                    <span className="sr-only">Wiatr</span>
                  </dt>
                  <dd data-testid="day-wind">
                    {selectedDay.windMaxKmh === null ? "brak danych" : `${Math.round(selectedDay.windMaxKmh)} km/h`}
                    {selectedDay.windDirectionDeg !== null && ` ${compassDirection(selectedDay.windDirectionDeg).short}`}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={returnToday}
                className="mt-3 flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1 text-caption text-text-primary transition-colors duration-(--dur-feedback) hover:bg-white/16"
              >
                <Undo2 aria-hidden className="size-3.5" strokeWidth={2} />
                Wróć do dziś
              </button>
            </motion.div>
          ) : (
            <motion.div key="today" {...swap} className="flex flex-col items-center" data-testid="weather-today">
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
            </motion.div>
          )}
        </AnimatePresence>
        <p role="status" className="sr-only" data-testid="weather-day-announcement">
          {selectedDay ? dayAnnouncement(selectedDay) : ""}
        </p>

        <div ref={curveRef} className="w-full px-1">
          <p className="sr-only">Prognoza na {weather.daily.length} dni</p>
          <TemperatureCurve
            days={weather.daily}
            today={today}
            selectedDate={selectedDay?.date ?? today}
            onHoverDay={onHoverDay}
            onSelectDay={onSelectDay}
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
