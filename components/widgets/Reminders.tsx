"use client";

import { Glass } from "@/components/ui/Glass";
import type { Reminder } from "@/lib/desktop/sample";
import { formatCountdown, formatTime, minutesUntil } from "@/lib/time";

interface RemindersProps {
  reminders: Reminder[];
  nextId: string | null;
  now: Date;
  timeZone: string;
  called: boolean;
}

/**
 * Przypomnienia (środek): oś czasu z kropkami, najbliższe w bursztynie.
 * Godzina występuje raz (makieta ją dubluje); przy najbliższym dochodzi odliczanie.
 */
export function Reminders({ reminders, nextId, now, timeZone, called }: RemindersProps) {
  return (
    <Glass
      depth="mid"
      role="region"
      aria-labelledby="reminders-title"
      id="reminders"
      tabIndex={-1}
      data-testid="reminders"
      data-called={called || undefined}
      className="flex h-53.5 w-50 shrink-0 flex-col rounded-widget px-5 pt-5 pb-4"
    >
      <h2 id="reminders-title" className="text-center text-title font-medium text-text-primary">
        Przypomnienia
      </h2>
      <ol className="mt-3 flex flex-1 flex-col justify-between">
        {reminders.map((reminder, i) => {
          const isNext = reminder.id === nextId;
          const isPast = reminder.at.getTime() < now.getTime() && !isNext;
          const minutes = minutesUntil(reminder.at, now);
          return (
            <li key={reminder.id} className="relative grid grid-cols-[auto_1fr] gap-x-3">
              {/* Oś czasu: kropka + przerywana linia do następnej pozycji. */}
              <span aria-hidden className="relative flex w-3 justify-center pt-1.5">
                <span className={`size-2.5 rounded-full ${isNext ? "bg-amber" : "bg-white/45"}`} />
                {i < reminders.length - 1 && (
                  <span className="absolute top-5 -bottom-2 border-l border-dashed border-white/30" />
                )}
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-body ${isNext ? "text-amber" : "text-text-primary"} ${isPast ? "line-through decoration-white/40" : ""}`}>
                  {reminder.title}
                </span>
                <span className={`block text-caption tabular-nums ${isNext ? "text-amber" : "text-text-secondary"}`}>
                  <time dateTime={reminder.at.toISOString()}>{formatTime(reminder.at, timeZone)}</time>
                  {isNext && ` · ${formatCountdown(minutes).toLowerCase()}`}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Glass>
  );
}
