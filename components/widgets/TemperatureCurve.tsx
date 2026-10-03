"use client";

import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { BOOT_MARK, curveTiming } from "@/lib/boot";
import { ease } from "@/lib/motion";
import { useBootState } from "@/lib/use-boot";
import { weekdayShort } from "@/lib/time";
import { temperatureCurve } from "@/lib/weather/curve";
import { dayTapAction } from "@/lib/weather/day-tap";
import type { DailyForecast } from "@/lib/weather/schema";

interface TemperatureCurveProps {
  days: DailyForecast[];
  /** Dzisiejsza data w strefie lokalizacji (`YYYY-MM-DD`): „dziś” w bursztynie. */
  today: string;
  /** Dzień pokazany w scenie (kliknięty albo dziś). */
  selectedDate: string;
  /** Najechanie / fokus na dzień (null = wyjście): podgląd pogody tego dnia w kuli. */
  onHoverDay: (date: string | null) => void;
  /** Kliknięcie: cała scena i szczegóły tego dnia (podróż w czasie). */
  onSelectDay: (date: string) => void;
}

const W = 230;
const H = 60;
/** Przejechanie kursorem przez rząd dni nie zapala podglądu; dopiero zatrzymanie na dniu. */
export const HOVER_INTENT_MS = 180;

function formatTemp(value: number | null): string {
  if (value === null) return "brak danych";
  const rounded = Math.round(value);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/** Mini krzywa maksymalnych temperatur z prawdziwej prognozy + dni pod spodem. */
export function TemperatureCurve({ days, today, selectedDate, onHoverDay, onSelectDay }: TemperatureCurveProps) {
  const gradientId = useId();
  const hoverTimer = useRef(0);
  /** Podgląd już widać: przejście na sąsiedni dzień zmienia go od razu, bez ponownego czekania. */
  const previewing = useRef(false);
  /** Dotyk: dzień podglądany po pierwszym dotknięciu (drugie przypina), lib/weather/day-tap.ts. */
  const touchPreview = useRef<string | null>(null);
  /** Rodzaj wskaźnika ostatniego naciśnięcia; klik z klawiatury nie ma pointerdown. */
  const pointerType = useRef("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  // Dotknięcie poza rzędem dni chowa podgląd (Safari nie daje przyciskom fokusu, więc bez blur).
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (touchPreview.current === null || listRef.current?.contains(event.target as Node)) return;
      touchPreview.current = null;
      onHoverDay(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onHoverDay]);

  const enterDay = (date: string) => {
    window.clearTimeout(hoverTimer.current);
    if (previewing.current) {
      onHoverDay(date);
      return;
    }
    hoverTimer.current = window.setTimeout(() => {
      previewing.current = true;
      onHoverDay(date);
    }, HOVER_INTENT_MS);
  };

  const leaveDays = () => {
    window.clearTimeout(hoverTimer.current);
    previewing.current = false;
    onHoverDay(null);
  };
  const curve = temperatureCurve(days, { width: W, height: H, inset: 8 });
  const todayPoint = curve.points.find((p) => p.date === today);

  // Krzywa rysuje się w rytmie sekwencji startowej: pióro, a wypełnienie 220 ms za nim.
  // Po starcie, po pominięciu i przy reduced motion jest od razu narysowana.
  const line = useMotionValue(0);
  const fill = useMotionValue(0);
  const timing = curveTiming(useBootState());
  const startAt = timing.kind === "draw" ? timing.startAt : 0;
  const drawMs = timing.kind === "draw" ? timing.duration : 0;
  const lagMs = timing.kind === "draw" ? timing.fillLag : 0;

  useEffect(() => {
    if (timing.kind === "wait") return;
    if (timing.kind === "instant") {
      line.jump(1);
      fill.jump(1);
      return;
    }
    const delay = Math.max(0, startAt - performance.now()) / 1000;
    let marked = false;
    const controls = [
      animate(line, 1, {
        duration: drawMs / 1000,
        ease: ease.pen,
        delay,
        onUpdate: (value) => {
          if (marked || value <= 0) return;
          marked = true;
          performance.mark(BOOT_MARK.curve);
        },
      }),
      animate(fill, 1, { duration: drawMs / 1000, ease: ease.soft, delay: delay + lagMs / 1000 }),
    ];
    return () => controls.forEach((control) => control.stop());
  }, [timing.kind, startAt, drawMs, lagMs, line, fill]);

  return (
    <div className="w-full">
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent-amber)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent-amber)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {curve.area && (
          <motion.path
            d={curve.area}
            fill={`url(#${gradientId})`}
            style={{ opacity: fill }}
          />
        )}
        {curve.path && (
          <motion.path
            d={curve.path}
            fill="none"
            stroke="var(--accent-amber)"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ pathLength: line }}
          />
        )}
        {todayPoint && (
          <circle cx={todayPoint.x} cy={todayPoint.y} r="4.5" fill="var(--accent-amber)" stroke="rgb(14 16 20 / 0.6)" strokeWidth="1.5" />
        )}
      </svg>

      <ol
        ref={listRef}
        className="mt-3 grid"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        // Dotyk też wysyła pointerleave (po podniesieniu palca): podgląd z dotyku zostaje.
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" || event.pointerType === "pen") leaveDays();
        }}
      >
        {days.map((day, i) => {
          const isToday = day.date === today;
          const selected = day.date === selectedDate;
          return (
            <li key={day.date} className="flex justify-center">
              {/* Najechanie i fokus: pogoda tego dnia w kuli; klik: cała scena i szczegóły w łuku. */}
              <button
                type="button"
                aria-pressed={selected}
                title={isToday ? "Pogoda dziś" : "Pokaż pogodę tego dnia"}
                data-testid="forecast-day"
                data-today={isToday || undefined}
                data-state={day.state}
                style={{ "--i": i }}
                // Wybrany inny dzień: jasne tło i biały napis. Dziś wyróżnia bursztyn – jasne tło
                // pod bursztynem obniżałoby kontrast poniżej 4,5:1 w jasnych scenach.
                className={`group flex flex-col items-center justify-center gap-1.5 rounded-pill px-1.5 py-1 transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 duration-(--dur-feedback) hover:bg-white/8 ${isToday ? "" : "aria-pressed:bg-white/10"}`}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse" || event.pointerType === "pen") enterDay(day.date);
                }}
                onPointerDown={(event) => {
                  pointerType.current = event.pointerType;
                }}
                onFocus={() => onHoverDay(day.date)}
                onBlur={() => {
                  if (touchPreview.current === null) onHoverDay(null);
                }}
                onClick={() => {
                  window.clearTimeout(hoverTimer.current);
                  const touch = pointerType.current === "touch";
                  pointerType.current = "";
                  if (touch) {
                    const action = dayTapAction(day.date, { previewed: touchPreview.current, shown: selectedDate, today });
                    if (action === "preview") {
                      // Pierwsze dotknięcie: tylko podgląd w kuli (odpowiednik tekstowy w role="status").
                      touchPreview.current = day.date;
                      onHoverDay(day.date);
                      return;
                    }
                    touchPreview.current = null;
                    onHoverDay(null);
                  }
                  // Wybrany dzień jest już w scenie: podgląd w kuli zbędny.
                  onSelectDay(day.date);
                }}
              >
                <span aria-hidden className={`size-2 rounded-full ${isToday ? "bg-amber" : "bg-white/35"}`} />
                <span
                  className={`text-caption ${isToday ? "text-amber" : "text-text-secondary group-hover:text-text-primary group-aria-pressed:text-text-primary"}`}
                >
                  {weekdayShort(day.date)}
                  <span className="sr-only">
                    {isToday ? " (dziś)" : ""}: do {formatTemp(day.temperatureMaxC)}, od {formatTemp(day.temperatureMinC)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
