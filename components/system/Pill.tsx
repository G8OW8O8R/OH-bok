"use client";

import { Glass } from "@/components/ui/Glass";
import type { Reminder } from "@/lib/desktop/sample";
import { formatCountdown, minutesUntil } from "@/lib/time";

interface PillProps {
  next: Reminder | null;
  now: Date;
  /** Krótki komunikat (np. „Dodano 3 składniki”), ma pierwszeństwo przed odliczaniem. */
  message: string | null;
}

/** Okno odliczania pierścienia: pełny pierścień = godzina do wydarzenia. */
const RING_WINDOW_MIN = 60;
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Pigułka powiadomień (środek u góry). Zawsze coś „trwa”: odliczanie do najbliższego
 * przypomnienia z pierścieniem, który domyka się w bursztynie.
 */
export function Pill({ next, now, message }: PillProps) {
  const minutes = next ? minutesUntil(next.at, now) : null;
  const progress = minutes === null ? 0 : 1 - Math.min(Math.max(minutes, 0), RING_WINDOW_MIN) / RING_WINDOW_MIN;

  return (
    <Glass
      depth="mid"
      parallax={false}
      data-slot="pill"
      data-testid="pill"
      className="flex h-12.75 min-w-0 items-center gap-3 rounded-pill pr-7 pl-2"
    >
      <svg aria-hidden viewBox="0 0 36 36" className="size-9.25 shrink-0 -rotate-90">
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
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <p role="status" aria-live="polite" className="truncate text-title text-text-primary">
        {message ??
          (next && minutes !== null ? (
            <>
              <span className="text-text-secondary">{formatCountdown(minutes)}:</span> {next.title}
            </>
          ) : (
            <span className="text-text-secondary">Brak nadchodzących przypomnień</span>
          ))}
      </p>
    </Glass>
  );
}
