"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { duration, ease } from "@/lib/motion";
import { weekdayShort } from "@/lib/time";
import { temperatureCurve } from "@/lib/weather/curve";
import type { DailyForecast } from "@/lib/weather/schema";

interface TemperatureCurveProps {
  days: DailyForecast[];
  /** Dzisiejsza data w strefie lokalizacji (`YYYY-MM-DD`): „dziś” w bursztynie. */
  today: string;
}

const W = 230;
const H = 60;
const DRAW_S = 1.4;
/** Wypełnienie idzie 220 ms za „piórem”. */
const FILL_LAG_S = 0.22;

function formatTemp(value: number | null): string {
  if (value === null) return "brak danych";
  const rounded = Math.round(value);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/** Mini krzywa maksymalnych temperatur z prawdziwej prognozy + dni pod spodem. */
export function TemperatureCurve({ days, today }: TemperatureCurveProps) {
  const reduceMotion = useReducedMotion();
  const gradientId = useId();
  const curve = temperatureCurve(days, { width: W, height: H, inset: 8 });
  const todayPoint = curve.points.find((p) => p.date === today);

  const draw = reduceMotion
    ? { duration: 0 }
    : { duration: DRAW_S, ease: ease.pen, delay: duration.feedback };

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
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: DRAW_S, ease: ease.soft, delay: duration.feedback + FILL_LAG_S }}
          />
        )}
        {curve.path && (
          <motion.path
            d={curve.path}
            fill="none"
            stroke="var(--accent-amber)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: reduceMotion ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={draw}
          />
        )}
        {todayPoint && (
          <circle cx={todayPoint.x} cy={todayPoint.y} r="4.5" fill="var(--accent-amber)" stroke="rgb(14 16 20 / 0.6)" strokeWidth="1.5" />
        )}
      </svg>

      <ol className="mt-3 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const isToday = day.date === today;
          return (
            <li key={day.date} className="flex flex-col items-center gap-1.5">
              <span aria-hidden className={`size-2 rounded-full ${isToday ? "bg-amber" : "bg-white/35"}`} />
              <span className={`text-caption ${isToday ? "text-amber" : "text-text-secondary"}`}>
                {weekdayShort(day.date)}
                <span className="sr-only">
                  {isToday ? " (dziś)" : ""}: do {formatTemp(day.temperatureMaxC)}, od {formatTemp(day.temperatureMinC)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
