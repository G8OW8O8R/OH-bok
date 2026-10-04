"use client";

import { Check, Droplet, MonitorUp, Navigation2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useId, useMemo, useState } from "react";
import { StatusCapsule, Window, WindowFooter, WindowScroll } from "@/components/system/Window";
import { duration, ease } from "@/lib/motion";
import { compassDirection } from "@/lib/scene-conditions";
import { WEATHER_LABELS, weatherLabel } from "@/lib/scenes";
import { formatTime, weekdayLong, weekdayShort } from "@/lib/time";
import { hourlyCurve, hoursOfDay, type HourPoint } from "@/lib/weather/hourly";
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
    <>
      <WindowScroll className="flex flex-col items-center gap-[calc(var(--u)*1.4)] pt-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={date} {...swap} className="flex flex-col items-center text-center" data-testid="weather-window-hero">
            <p className="text-lead font-medium text-text-primary">{weather.location.isDefault ? "Gdańsk" : "Twoja lokalizacja"}</p>
            {isToday ? <TodayHero weather={weather} /> : day && <DayHero day={day} />}
          </motion.div>
        </AnimatePresence>
        <HourlyChart weather={weather} day={day} date={date} now={isToday ? now : null} />
        <DayCards days={weather.daily} today={today} selected={date} onSelect={setSelected} />
      </WindowScroll>
      <WindowFooter className="justify-between border-t-0 pt-2">
        <p className="min-w-0 truncate text-caption text-text-secondary" aria-live="polite">
          {`${onDesktop ? "Na pulpicie" : "Wybrano"}: ${isToday ? "dziś" : weekdayLong(date).toLowerCase()}`}
        </p>
        <button
          type="button"
          onClick={() => onShow(date)}
          disabled={onDesktop}
          className="flex shrink-0 items-center gap-2 rounded-pill bg-amber px-5 py-2.5 text-body font-medium text-[rgb(20_14_8)] transition-[scale,background-color,color] duration-(--dur-feedback) ease-out hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 disabled:bg-white/10 disabled:text-text-secondary disabled:hover:scale-100"
        >
          {onDesktop ? (
            <Check aria-hidden className="size-4" strokeWidth={2.25} />
          ) : (
            <MonitorUp aria-hidden className="size-4" strokeWidth={2} />
          )}
          {onDesktop ? "Na pulpicie" : "Pokaż na pulpicie"}
        </button>
      </WindowFooter>
    </>
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
      <p className="text-temp font-medium text-text-primary tabular-nums" data-testid="weather-window-temp">
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
        <span className="text-temp">
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

const CHART = { width: 1000, height: 100, inset: 24 } as const;
/** Ikona i temperatura co 3 godziny: 8 znaczników mieści się także na telefonie. */
const MARK_EVERY = 3;

function HourlyChart({ weather, day, date, now }: { weather: WeatherData; day: DailyForecast | undefined; date: string; now: Date | null }) {
  const reduceMotion = useReducedMotion();
  const clipId = useId();
  const hours = useMemo(() => hoursOfDay(weather.hourly, date, weather.timezone), [weather.hourly, date, weather.timezone]);
  const curve = useMemo(() => hourlyCurve(hours, day, weather.timezone, CHART, now), [hours, day, weather.timezone, now]);
  const marks = curve.points.filter((p) => p.hour % MARK_EVERY === 0);
  const pct = (p: HourPoint) => ({ left: `${(p.x / CHART.width) * 100}%`, top: `${(p.y / CHART.height) * 100}%` });
  const draw = reduceMotion ? { duration: 0 } : { duration: 1.1, ease: ease.pen };

  if (curve.points.length < 2) {
    return <p className="py-6 text-body text-text-secondary">Brak prognozy godzinowej dla tego dnia.</p>;
  }

  return (
    <figure className="w-full" data-testid="weather-hourly">
      <figcaption className="sr-only">Temperatura co godzinę, {weekdayLong(date).toLowerCase()}</figcaption>
      <div aria-hidden className="relative mt-[calc(var(--u)*3.6)] h-[calc(var(--u)*5)] min-h-16">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <defs>
            {/* Przed bieżącą godziną linia jest przygaszona: to już minęło. */}
            <clipPath id={clipId}>
              <rect x={curve.now?.x ?? 0} y={-50} width={CHART.width} height={CHART.height + 100} />
            </clipPath>
          </defs>
          <motion.path
            key={`${date}-base`}
            d={curve.path}
            fill="none"
            stroke="rgb(255 255 255 / 0.3)"
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={draw}
          />
          <motion.path
            key={`${date}-line`}
            d={curve.path}
            fill="none"
            stroke="rgb(255 255 255 / 0.85)"
            strokeWidth={2.25}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${clipId})`}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={draw}
          />
        </svg>
        {marks.map((p) => {
          const Icon = weatherIcon(p.state, p.isDay);
          const past = curve.now !== null && p.hour < curve.now.hour;
          return (
            <div
              key={p.time}
              style={pct(p)}
              className={`absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5 pb-2 ${past ? "opacity-55" : ""}`}
            >
              <Icon className="size-5 text-text-primary" strokeWidth={1.75} />
              <span className="text-caption text-text-primary tabular-nums">{formatTemperature(p.temperatureC)}</span>
            </div>
          );
        })}
        {curve.now && (
          <span
            style={pct(curve.now)}
            data-testid="weather-hourly-now"
            className="absolute size-3 -translate-1/2 rounded-full bg-amber shadow-[0_0_0_4px_rgb(245_160_74/0.25)]"
          />
        )}
      </div>
      <div aria-hidden className="relative mt-3 h-5">
        {/* Godziny co 3 h (na wąskim ekranie co 6 h); przy bieżącej godzinie zamiast nich „teraz”. */}
        {marks
          .filter((p) => curve.now === null || Math.abs(p.hour - curve.now.hour) > 1)
          .map((p) => (
            <span
              key={p.time}
              style={{ left: pct(p).left }}
              className={`absolute -translate-x-1/2 text-caption text-text-secondary tabular-nums ${p.hour % 6 === 0 ? "" : "max-sm:hidden"}`}
            >
              {p.hour}:00
            </span>
          ))}
        {curve.now && (
          <span style={{ left: pct(curve.now).left }} className="absolute -translate-x-1/2 text-caption font-medium text-amber">
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
              <th scope="row">{`${p.hour}:00`}</th>
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
  return (
    <div role="group" aria-label={`Prognoza na ${days.length} dni`} className="weather-days w-full">
      {days.map((day) => {
        const Icon = weatherIcon(day.state, true, day.weatherCode);
        const active = day.date === selected;
        const label = day.date === today ? "Dziś" : weekdayShort(day.date);
        return (
          <button
            key={day.date}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(day.date)}
            data-testid="weather-day-card"
            className={`flex flex-col items-center gap-1.5 rounded-[calc(var(--u)*1.1)] border px-2 py-3 transition-[background-color,border-color,scale] duration-(--dur-feedback) ease-out active:scale-[0.97] ${
              active ? "border-amber/80 bg-amber/10" : "border-white/8 bg-white/6 hover:bg-white/10"
            }`}
          >
            <span className={`text-body font-medium ${active ? "text-amber" : "text-text-primary"}`}>
              <span aria-hidden>{label}</span>
              <span className="sr-only">{day.date === today ? "Dziś" : weekdayLong(day.date)}</span>
            </span>
            <Icon aria-hidden className="size-6 text-text-primary" strokeWidth={1.75} />
            <span className="sr-only">{WEATHER_LABELS[day.state]}</span>
            <span className="text-body whitespace-nowrap tabular-nums">
              <span className="font-medium text-text-primary">{formatTemperature(day.temperatureMaxC)}</span>
              <span className="text-text-secondary">/{formatTemperature(day.temperatureMinC)}</span>
            </span>
            <span className="flex items-center gap-1 text-caption text-text-secondary tabular-nums">
              <Droplet aria-hidden className="size-3.5" strokeWidth={1.75} />
              <span className="sr-only">Szansa opadów </span>
              {day.precipitationProbabilityMax === null ? "–" : `${Math.round(day.precipitationProbabilityMax)}%`}
            </span>
            <span className="flex items-center gap-1 text-caption whitespace-nowrap text-text-secondary tabular-nums">
              <Navigation2
                aria-hidden
                className="size-3.5"
                strokeWidth={1.75}
                style={{ rotate: `${(day.windDirectionDeg ?? 0) + 180}deg`, opacity: day.windDirectionDeg === null ? 0 : 1 }}
              />
              <span className="sr-only">Wiatr </span>
              {day.windMaxKmh === null ? "–" : `${Math.round(day.windMaxKmh)} km/h`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
