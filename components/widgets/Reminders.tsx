"use client";

import { Plus } from "lucide-react";
import { Glass } from "@/components/ui/Glass";
import { originLayoutId } from "@/lib/windows/apps";
import { pendingReminders, type Reminder } from "@/lib/reminders/reminders";
import { formatCountdown, formatWhen, minutesUntil } from "@/lib/time";

interface RemindersProps {
  reminders: Reminder[];
  /** Najbliższe przypomnienie (to samo, które pokazuje pigułka). */
  nextId: string | null;
  now: Date;
  timeZone: string;
  called: boolean;
  /** Otwiera okno aplikacji, które rozwija się z kafelka (przejście współdzielone). */
  onOpen: () => void;
}

const VISIBLE = 3;

/**
 * Przypomnienia (środek): oś czasu z kropkami, najbliższe w bursztynie.
 * Godzina występuje raz (makieta ją dubluje); przy najbliższym dochodzi odliczanie.
 */
export function Reminders({ reminders, nextId, now, timeZone, called, onOpen }: RemindersProps) {
  const pending = pendingReminders(reminders);
  const visible = pending.slice(0, VISIBLE);
  const hidden = pending.length - visible.length;

  return (
    <Glass
      layoutId={originLayoutId("reminders", "tile")}
      depth="mid"
      role="region"
      aria-labelledby="reminders-title"
      id="reminders"
      tabIndex={-1}
      data-testid="reminders"
      data-called={called || undefined}
      onDoubleClick={onOpen}
      className="flex h-53.5 w-(--column-width) shrink-0 flex-col rounded-widget px-5 pt-5 pb-4 desk:w-54"
    >
      <h2 id="reminders-title" className="text-center text-title font-medium text-text-primary">
        Przypomnienia
      </h2>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Otwórz przypomnienia"
        title="Otwórz przypomnienia"
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-text-secondary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary"
      >
        <Plus aria-hidden className="size-4.5" strokeWidth={1.75} />
      </button>
      {visible.length === 0 ? (
        <p className="m-auto text-center text-body text-text-secondary">Brak przypomnień</p>
      ) : (
        <ol className="mt-3 flex flex-1 flex-col justify-between">
          {visible.map((reminder, i) => {
            const isNext = reminder.id === nextId;
            const at = new Date(reminder.at);
            const minutes = minutesUntil(at, now);
            return (
              <li key={reminder.id} className="relative grid grid-cols-[auto_1fr] gap-x-3">
                {/* Oś czasu: kropka + przerywana linia do następnej pozycji. */}
                <span aria-hidden className="relative flex w-3 justify-center pt-1.5">
                  <span className={`size-2.5 rounded-full ${isNext ? "bg-amber" : "bg-white/45"}`} />
                  {i < visible.length - 1 && (
                    <span className="absolute top-5 -bottom-2 border-l border-dashed border-white/30" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-body ${isNext ? "text-amber" : "text-text-primary"}`}>
                    {reminder.title}
                  </span>
                  <span className={`block text-caption tabular-nums ${isNext ? "text-amber" : "text-text-secondary"}`}>
                    <time dateTime={reminder.at}>{formatWhen(at, now, timeZone)}</time>
                    {/* Odliczanie przenosi się w całości („za 7 h 57 min”), bez samotnego „min” w nowej linii. */}
                    {isNext && (
                      <>
                        {" · "}
                        <span className="whitespace-nowrap">{formatCountdown(minutes).toLowerCase()}</span>
                      </>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
          {hidden > 0 && <li className="mt-1 text-center text-caption text-text-secondary">+{hidden} więcej</li>}
        </ol>
      )}
    </Glass>
  );
}
