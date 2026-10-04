"use client";

import { Check, Droplet, MonitorUp, Navigation2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useId, useMemo, useState } from "react";
import { StatusCapsule, Window, WindowFooter, WindowScroll } from "@/components/system/Window";
import { duration, ease } from "@/lib/motion";
import { compassDirection } from "@/lib/scene-conditions";
import { WEATHER_LABELS, weatherLabel } from "@/lib/scenes";
import { formatTime, weekdayLong, weekdayShort } from "@/lib/time";
import { useElementSize } from "@/lib/use-element-size";
import { DAY_AXIS, hourlyCurve, labeledHours, type HourPoint } from "@/lib/weather/hourly";
import type { DailyForecast, WeatherData } from "@/lib/weather/schema";
import { weatherIcon } from "./weather-icons";

interface WeatherAppProps {
  weather: WeatherData;
  now: Date;
  /** Strefa użytkownika: godzina „zaktualizowano”. */
  timeZone: string;
  /** Dzisiejsza data w strefie lokalizacji. */
  today: string;
  /** Dzień pokazany teraz na pulpicie (przypięty albo dziś). */
  shownDate: string;
  /** „Pokaż na pulpicie”: przypina dzień w scenie (dziś = powrót do bieżącej pogody). */
  onShow: (date: string) => void;
}

function formatTemperature(celsius: number | null): string {
  if (celsius === null) return "–";
  const rounded = Math.round(celsius);
  return `${rounded === 0 ? 0 : rounded}°`;
}

function formatMm(mm: number): string {
  return `${mm.toLocaleString("pl-PL", { maximumFractionDigits: mm >= 10 ? 0 : 1 })} mm`;
}

function windText(kmh: number | null, deg: number | null, prefix = ""): string | null {
  if (kmh === null) return null;
  const from = deg === null ? "" : ` ${compassDirection(deg).short}`;
  return `wiatr ${prefix}${Math.round(kmh)} km/h${from}`;
}

/** Okno Pogody: bieżące warunki, krzywa godzinowa wybranego dnia, karty 7 dni, przypięcie dnia. */
export function WeatherApp(props: WeatherAppProps) {
  const { weather, timeZone } = props;
  return (
    <Window id="weather" size="large" status={<WeatherStatus weather={weather} timeZone={timeZone} />}>
      <WeatherContent {...props} />
    </Window>
  );
}

function WeatherStatus({ weather, timeZone }: { weather: WeatherData; timeZone: string }) {
  const updated = formatTime(new Date(weather.fetchedAt), timeZone);
  const state =
    weather.source === "live" ? `zaktualizowano ${updated}` : weather.source === "cache" ? `z pamięci · ${updated}` : "demo";
  const dot = weather.source === "live" ? "bg-[#4ade80]" : weather.source === "cache" ? "bg-amber" : "bg-white/50";
  return (
    <StatusCapsule>
      <span className="flex items-center gap-2 whitespace-nowrap text-text-primary">
        <span aria-hidden className={`size-2 rounded-full ${dot}`} />
        Dane pogodowe:{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-white/40 underline-offset-2 hover:decoration-white"
        >
          Open-Meteo.com
        </a>
      </span>
      <span className="whitespace-nowrap" data-testid="weather-window-source">
        <span aria-hidden className="max-sm:hidden">· </span>
        {state}
      </span>
    </StatusCapsule>
  );
}

function WeatherContent({ weather, now, today, shownDate, onShow }: WeatherAppProps) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState(() => (weather.daily.some((d) => d.date === shownDate) ? shownDate : today));
  const day = weather.daily.find((d) => d.date === selected) ?? weather.daily[0];
  const date = day?.date ?? today;
  const isToday = date === today;
  const onDesktop = date === shownDate;
  const swap = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -4 },
    transition: { duration: reduceMotion ? duration.reducedFade / 2 : 0.16, ease: ease.soft },
  };

  return (
    <div className="weather-app flex min-h-0 flex-1 flex-col">
      {/* Miasto i temperatura poza przewijaniem: nigdy nie są ucięte. Na desktopie miasto stoi
          w linii tytułu (makieta); przeciąganie za nagłówek przechodzi przez ten blok. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={date}
          {...swap}
          className="weather-hero flex shrink-0 flex-col items-center px-6 text-center lg:pointer-events-none"
          data-testid="weather-window-hero"
        >
          <p className="text-lead font-medium text-text-primary">{weather.location.isDefault ? "Gdańsk" : "Twoja lokalizacja"}</p>
          {isToday ? <TodayHero weather={weather} /> : day && <DayHero day={day} />}
        </motion.div>
      </AnimatePresence>
      <WindowScroll className="flex flex-col items-center gap-(--wa-gap) pb-0!">
        <HourlyChart weather={weather} day={day} date={date} now={isToday ? now : null} />
        <DayCards days={weather.daily} today={today} selected={date} onSelect={setSelected} />
      </WindowScroll>
      {/* Stan przypięcia pokazuje sam przycisk główny. */}
      <WindowFooter className="justify-end border-t-0 py-(--wa-gap)! max-lg:pb-[max(1rem,env(safe-area-inset-bottom))]!">
        <button
          type="button"
          onClick={() => onShow(date)}
          disabled={onDesktop}
          className="flex shrink-0 items-center gap-2 rounded-pill bg-amber px-5 py-2.5 text-body font-medium text-[rgb(20_14_8)] transition-[scale,background-color,color] duration-(--dur-feedback) ease-out hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:bg-white/10 disabled:text-text-primary disabled:hover:scale-100"
        >
          {onDesktop ? (
            <Check aria-hidden className="size-4" strokeWidth={2.25} />
          ) : (
            <MonitorUp aria-hidden className="size-4" strokeWidth={2} />
          )}
          {onDesktop ? "Na pulpicie" : "Pokaż na pulpicie"}
        </button>
      </WindowFooter>
    </div>
  );
}

function TodayHero({ weather }: { weather: WeatherData }) {
  const { current } = weather;
  const details = [
    `odczuwalna ${formatTemperature(current.apparentTemperatureC)}`,
    current.humidityPct === null ? null : `wilgotność ${Math.round(current.humidityPct)}%`,
    windText(current.windKmh, current.windDirectionDeg),
  ];
  return (
    <>
      <p className="weather-temp font-medium text-text-primary tabular-nums" data-testid="weather-window-temp">
        {formatTemperature(current.temperatureC)}
      </p>
      <p className="mt-1 text-title font-medium text-text-primary">{weatherLabel(current.state, current.isDay)}</p>
      <Details items={details} />
    </>
  );
}

/** Linia szczegółów: łamie się tylko między pozycjami („wiatr 14 km/h W” zostaje w całości). */
function Details({ items }: { items: (string | null)[] }) {
  const shown = items.filter((item): item is string => item !== null);
  return (
    <p className="mt-0.5 max-w-full text-body text-balance text-text-secondary tabular-nums">
      {shown.map((item, i) => (
        <Fragment key={item}>
          <span className="whitespace-nowrap">
            {item}
            {i < shown.length - 1 && " ·"}
          </span>
          {i < shown.length - 1 && " "}
        </Fragment>
      ))}
    </p>
  );
}

function DayHero({ day }: { day: DailyForecast }) {
  const rain =
    day.precipitationProbabilityMax === null
      ? null
      : `opady ${Math.round(day.precipitationProbabilityMax)}%${day.precipitationSumMm !== null && day.precipitationSumMm >= 0.1 ? ` · ${formatMm(day.precipitationSumMm)}` : ""}`;
  const details = [rain, windText(day.windMaxKmh, day.windDirectionDeg, "do ")];
  return (
    <>
      <p className="flex items-baseline gap-[0.14em] font-medium text-text-primary tabular-nums" data-testid="weather-window-temp">
        <span className="weather-temp">
          <span className="sr-only">Najwyżej </span>
          {formatTemperature(day.temperatureMaxC)}
        </span>
        <span className="text-lead font-normal text-text-secondary">
          <span className="sr-only">, najniżej </span>
          {formatTemperature(day.temperatureMinC)}
        </span>
      </p>
      <p className="mt-1 text-title font-medium text-text-primary">
        {weekdayLong(day.date)} · {WEATHER_LABELS[day.state].toLowerCase()}
      </p>
      <Details items={details} />
    </>
  );
}

/** Zapas wokół krzywej (px): kropka „teraz” i poświata nie są ucinane na krańcach osi. */
const CHART_INSET = 14;
/** Rozmiar przed pierwszym pomiarem (okno montuje się po hydracji, pomiar jest przed malowaniem). */
const CHART_FALLBACK = { width: 1000, height: 80 };

/** Etykiety i ikony co 2 h (na telefonie co 4 h). */
const MARK_EVERY = 2;

function hourLabel(hour: number): string {
  return `${hour}:00`;
}

function HourlyChart({ weather, day, date, now }: { weather: WeatherData; day: DailyForecast | undefined; date: string; now: Date | null }) {
  const reduceMotion = useReducedMotion();
  const ids = useId();
  const [chartRef, size] = useElementSize<HTMLDivElement>(CHART_FALLBACK);
  const curve = useMemo(
    () => hourlyCurve(weather.hourly, date, day, weather.timezone, { ...size, inset: CHART_INSET }, now),
    [weather.hourly, date, day, weather.timezone, now, size],
  );
  const labeled = useMemo(() => labeledHours(curve.points, curve.now), [curve]);
  const marks = curve.points.filter((p) => (p.hour - DAY_AXIS.from) % MARK_EVERY === 0);
  // Na telefonie co drugi znacznik (co 4 h): 10 etykiet nie mieści się w 342 px.
  const narrowHidden = (p: HourPoint) => ((p.hour - DAY_AXIS.from) % 4 === 0 ? "" : "max-sm:hidden");
  const pct = (p: HourPoint) => ({ left: `${(p.x / size.width) * 100}%`, top: `${(p.y / size.height) * 100}%` });
  const draw = reduceMotion ? { duration: 0 } : { duration: 1.1, ease: ease.pen };
  const nowX = curve.now?.x ?? 0;

  if (curve.points.length < 2) {
    return <p className="py-6 text-body text-text-secondary">Brak prognozy godzinowej dla tego dnia.</p>;
  }

  return (
    <figure className="w-full" data-testid="weather-hourly">
      <figcaption className="sr-only">Temperatura co godzinę, {weekdayLong(date).toLowerCase()}</figcaption>
      <div ref={chartRef} aria-hidden className="weather-chart relative">
        {/* SVG w pikselach kontenera: bez skalowania rysowanie `pathLength` i grubość linii są dokładne. */}
        <svg viewBox={`0 0 ${size.width} ${size.height}`} className="weather-curve absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id={`${ids}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent-amber)" stopOpacity="0.24" />
              <stop offset="1" stopColor="var(--accent-amber)" stopOpacity="0" />
            </linearGradient>
            {/* Przed bieżącą godziną linia jest przygaszona: to już minęło. */}
            <clipPath id={`${ids}-past`}>
              <rect x={-50} y={-50} width={nowX + 50} height={size.height + 100} />
            </clipPath>
            <clipPath id={`${ids}-future`}>
              <rect x={nowX} y={-50} width={size.width} height={size.height + 100} />
            </clipPath>
          </defs>
          <motion.path
            key={`${date}-area`}
            d={curve.area}
            fill={`url(#${ids}-fill)`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay: 0.22, ease: ease.soft }}
          />
          {curve.now && (
            <motion.path
              key={`${date}-past`}
              d={curve.path}
              fill="none"
              stroke="var(--accent-amber)"
              strokeOpacity={0.42}
              strokeWidth={3}
              strokeLinecap="round"
              clipPath={`url(#${ids}-past)`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={draw}
            />
          )}
          <motion.path
            key={`${date}-line`}
            d={curve.path}
            fill="none"
            stroke="var(--accent-amber)"
            strokeWidth={3}
            strokeLinecap="round"
            clipPath={curve.now ? `url(#${ids}-future)` : undefined}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={draw}
          />
        </svg>
        {marks.map((p) => {
          const Icon = weatherIcon(p.state, p.isDay);
          return (
            <div
              key={p.time}
              style={pct(p)}
              className={`absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5 pb-2.5 ${narrowHidden(p)}`}
            >
              {labeled.has(p.hour) && p.hour !== curve.now?.hour && (
                <span className="text-caption font-medium text-text-primary tabular-nums">{formatTemperature(p.temperatureC)}</span>
              )}
              <Icon className="weather-chart-icon text-text-primary" strokeWidth={1.75} />
            </div>
          );
        })}
        {curve.now && (
          <span
            style={pct(curve.now)}
            data-testid="weather-hourly-now"
            className="weather-now absolute size-3.5 -translate-1/2 rounded-full bg-amber"
          >
            {/* Temperatura bieżącej godziny nad kropką, ponad ikoną sąsiedniego znacznika. */}
            <span className="absolute bottom-full left-1/2 mb-[calc(var(--weather-chart-icon)+0.875rem)] -translate-x-1/2 text-caption font-semibold text-text-primary tabular-nums">
              {formatTemperature(curve.now.temperatureC)}
            </span>
          </span>
        )}
      </div>
      <div aria-hidden className="relative mt-2.5 h-5">
        {/* Przy bieżącej godzinie zamiast etykiety „teraz”. */}
        {marks
          .filter((p) => curve.now === null || Math.abs(p.hour - curve.now.hour) > 1)
          .map((p) => (
            <span
              key={p.time}
              style={{ left: pct(p).left }}
              className={`absolute -translate-x-1/2 text-caption whitespace-nowrap text-text-secondary tabular-nums ${narrowHidden(p)}`}
            >
              {hourLabel(p.hour)}
            </span>
          ))}
        {curve.now && (
          <span style={{ left: pct(curve.now).left }} className="absolute -translate-x-1/2 text-caption font-semibold text-text-primary">
            teraz
          </span>
        )}
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">Godzina</th>
            <th scope="col">Temperatura</th>
            <th scope="col">Pogoda</th>
          </tr>
        </thead>
        <tbody>
          {curve.points.map((p) => (
            <tr key={p.time}>
              <th scope="row">{hourLabel(p.hour)}</th>
              <td>{formatTemperature(p.temperatureC)}</td>
              <td>{WEATHER_LABELS[p.state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function DayCards({
  days,
  today,
  selected,
  onSelect,
}: {
  days: DailyForecast[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const ids = useId();
  return (
    <div role="group" aria-label={`Prognoza na ${days.length} dni`} className="weather-days w-full">
      {days.map((day) => {
        const Icon = weatherIcon(day.state, true, day.weatherCode);
        const active = day.date === selected;
        const label = day.date === today ? "Dziś" : weekdayShort(day.date);
        const tipId = `${ids}-${day.date}`;
        const sum = day.precipitationSumMm !== null && day.precipitationSumMm >= 0.1 ? formatMm(day.precipitationSumMm) : null;
        return (
          <button
            key={day.date}
            type="button"
            aria-pressed={active}
            aria-describedby={tipId}
            onClick={() => onSelect(day.date)}
            data-testid="weather-day-card"
            className={`day-card weather-card relative flex flex-col items-center rounded-[calc(var(--u)*1.2)] border px-2 transition-[background-color,border-color,scale] duration-(--dur-feedback) ease-out active:scale-[0.97] ${
              active ? "border-amber/80 bg-[rgb(8_10_14/0.42)]" : "border-white/10 bg-white/6 hover:bg-white/11"
            }`}
          >
            <span className={`text-body font-medium ${active ? "text-amber" : "text-text-primary"}`}>
              <span aria-hidden>{label}</span>
              <span className="sr-only">{day.date === today ? "Dziś" : weekdayLong(day.date)}</span>
            </span>
            <Icon aria-hidden className="weather-card-icon text-text-primary" strokeWidth={1.6} />
            <span className="sr-only">{WEATHER_LABELS[day.state]}</span>
            <span className="flex items-baseline whitespace-nowrap tabular-nums">
              <span className="weather-card-max font-medium text-text-primary">
                <span className="sr-only">Najwyżej </span>
                {formatTemperature(day.temperatureMaxC)}
              </span>
              {/* Min. jaśniejsze niż zwykły drugorzędny tekst (.78): we mgle karta stoi nad jasną latarnią. */}
              <span className="text-body text-white/78">
                <span className="sr-only">, najniżej </span>/{formatTemperature(day.temperatureMinC)}
              </span>
            </span>
            <span className="flex items-center gap-1 text-caption text-text-secondary tabular-nums">
              <Droplet aria-hidden className="size-3.5" strokeWidth={1.75} />
              <span className="sr-only">Szansa opadów </span>
              {day.precipitationProbabilityMax === null ? "–" : `${Math.round(day.precipitationProbabilityMax)}%`}
            </span>
            {/* Dymek: wiatr i suma opadu po najechaniu albo fokusie (na dotyku – w linii pod temperaturą). */}
            <span
              id={tipId}
              role="tooltip"
              className="day-tip pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex items-center gap-1.5 rounded-pill bg-[rgb(14_16_20/0.86)] px-3 py-1.5 text-caption whitespace-nowrap text-text-primary shadow-(--depth-mid) tabular-nums"
            >
              <Navigation2
                aria-hidden
                className="size-3.5"
                strokeWidth={1.75}
                style={{ rotate: `${(day.windDirectionDeg ?? 0) + 180}deg`, opacity: day.windDirectionDeg === null ? 0 : 1 }}
              />
              {day.windMaxKmh === null
                ? "Wiatr: brak danych"
                : `Wiatr do ${Math.round(day.windMaxKmh)} km/h${day.windDirectionDeg === null ? "" : ` ${compassDirection(day.windDirectionDeg).short}`}`}
              {sum && <span className="text-text-secondary">· {sum}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
