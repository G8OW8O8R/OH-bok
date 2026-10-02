"use client";

import { motion, useReducedMotion, type PanInfo } from "motion/react";
import type { ReactNode } from "react";
import { Glass } from "@/components/ui/Glass";
import { spring, transitionFor } from "@/lib/motion";
import { isDue, SNOOZE_MINUTES, type Reminder } from "@/lib/reminders/reminders";
import { formatCountdown, formatTime, minutesUntil } from "@/lib/time";

interface PillProps {
  next: Reminder | null;
  now: Date;
  /** Krótki komunikat (np. „Dodano 3 składniki”), ma pierwszeństwo przed odliczaniem. */
  message: string | null;
  /** Dane z localStorage wczytane: przed tym nie twierdzimy, że nic nie czeka. */
  ready: boolean;
  timeZone: string;
  onSnooze: (reminder: Reminder) => void;
  onComplete: (reminder: Reminder) => void;
}

/** Okno odliczania pierścienia: pełny pierścień = godzina do wydarzenia. */
const RING_WINDOW_MIN = 60;
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
/** Swipe w bok: przesunięcie (px) albo prędkość (px/s), od której pigułka odkłada przypomnienie. */
const SWIPE_OFFSET = 70;
const SWIPE_VELOCITY = 500;

const action =
  "rounded-pill px-4 py-1.5 text-body transition-[background-color,scale] duration-(--dur-feedback) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber active:scale-95";

/**
 * Pigułka powiadomień (środek u góry). Zawsze coś „trwa”: odliczanie do najbliższego
 * przypomnienia z pierścieniem, który domyka się w bursztynie. W chwili terminu rozwija się
 * jak Dynamic Island (sprężyna): „Drzemka 10 min” (też swipe w bok) albo „Gotowe”.
 */
export function Pill({ next, now, message, ready, timeZone, onSnooze, onComplete }: PillProps) {
  const reduceMotion = useReducedMotion();
  const due = next !== null && isDue(next, now);
  const minutes = next ? minutesUntil(new Date(next.at), now) : null;
  const progress = !due && minutes !== null ? 1 - Math.min(Math.max(minutes, 0), RING_WINDOW_MIN) / RING_WINDOW_MIN : 1;
  const showRing = due || (next !== null && minutes !== null);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (next && due && (Math.abs(info.offset.x) > SWIPE_OFFSET || Math.abs(info.velocity.x) > SWIPE_VELOCITY)) {
      onSnooze(next);
    }
  };

  let status: ReactNode;
  if (message) {
    status = message;
  } else if (!ready) {
    status = <span className="text-text-secondary">&nbsp;</span>;
  } else if (next && due) {
    status = (
      <>
        <span className="text-amber">Teraz:</span> {next.title}
      </>
    );
  } else if (next && minutes !== null) {
    status = (
      <>
        <span className="text-text-secondary">{formatCountdown(minutes)}:</span> {next.title}
      </>
    );
  } else {
    status = <span className="text-text-secondary">Brak nadchodzących przypomnień</span>;
  }

  return (
    // Stały slot w siatce nagłówka: rozwinięta pigułka rośnie w dół i nie przesuwa logo ani zegara.
    <div
      data-slot="pill"
      data-ready={ready}
      // Do wczytania danych z localStorage pigułka jest niewidoczna: jej szerokość zależy od treści,
      // a pokazanie jej od razu przesunęłoby sąsiednie elementy (CLS).
      className="relative z-20 flex h-12.75 justify-center data-[ready=false]:invisible"
    >
      <Glass
        layout
        depth="mid"
        parallax={false}
        data-testid="pill"
        data-due={due || undefined}
        transition={transitionFor(reduceMotion, spring.gentle)}
        drag={due ? "x" : false}
        dragSnapToOrigin
        dragElastic={0.4}
        dragTransition={{ bounceStiffness: 500, bounceDamping: 35 }}
        onDragEnd={onDragEnd}
        style={{ borderRadius: due ? 28 : 999 }}
        className={`flex min-w-0 flex-col gap-3 pl-2 ${due ? "w-max max-w-full cursor-grab touch-pan-y px-2 pt-2 pb-4 active:cursor-grabbing" : "h-12.75 justify-center pr-7"}`}
      >
        <motion.div layout="position" className="flex min-w-0 items-center gap-3">
          {showRing && (
            <svg
              aria-hidden
              viewBox="0 0 36 36"
              className={`size-9.25 shrink-0 -rotate-90 ${due ? "motion-safe:animate-pulse" : ""}`}
            >
              <circle cx="18" cy="18" r={RING_R} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="2.5" />
              <circle
                cx="18"
                cy="18"
                r={RING_R}
                fill="none"
                stroke="var(--accent-amber)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
              />
            </svg>
          )}
          {!showRing && <span aria-hidden className="size-9.25 shrink-0" />}
          <div className="min-w-0">
            <p role="status" aria-live="polite" className="truncate pr-5 text-title text-text-primary">
              {status}
            </p>
            {due && next && (
              <p className="pr-5 text-caption text-text-secondary tabular-nums">
                {formatTime(new Date(next.at), timeZone)}
                <span aria-hidden> · przesuń w bok, by odłożyć</span>
              </p>
            )}
          </div>
        </motion.div>
        {due && next && (
          <motion.div
            className="flex items-center justify-center gap-2 pr-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: reduceMotion ? 0 : 0.1, duration: 0.2 } }}
          >
            <button
              type="button"
              onClick={() => onSnooze(next)}
              className={`${action} bg-white/12 text-text-primary hover:bg-white/20`}
            >
              Drzemka {SNOOZE_MINUTES} min
            </button>
            <button
              type="button"
              onClick={() => onComplete(next)}
              className={`${action} bg-amber font-medium text-[rgb(20_14_8)] hover:brightness-105`}
            >
              Gotowe
            </button>
          </motion.div>
        )}
      </Glass>
    </div>
  );
}
