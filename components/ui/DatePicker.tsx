"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  compareMonths,
  formatDayLabel,
  formatMonth,
  monthGrid,
  monthOf,
  moveDate,
  shiftMonth,
  WEEKDAYS,
  type MonthRef,
} from "@/lib/calendar";
import { duration, ease, transitionFor } from "@/lib/motion";

interface DatePickerProps {
  /** Wybrany dzień `YYYY-MM-DD`. */
  value: string;
  /** Dziś w strefie użytkownika: wcześniejsze dni są wyłączone. */
  today: string;
  onChange: (date: string) => void;
  id: string;
}

const navButton =
  "grid size-[max(2rem,calc(var(--u)*1.9))] place-items-center rounded-full text-text-secondary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber disabled:pointer-events-none disabled:opacity-30";

/**
 * Mały kalendarz w szkle (wzorzec APG „date picker”): siatka `role="grid"`, jeden przystanek
 * Tab (ruchomy `tabindex`), strzałki/Home/End/PageUp/PageDown przesuwają fokus, Enter/Spacja
 * wybiera. Dni z przeszłości są wyłączone, dziś ma obrączkę, wybrany dzień jest bursztynowy.
 */
export function DatePicker({ value, today, onChange, id }: DatePickerProps) {
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<MonthRef>(() => monthOf(value));
  const [focused, setFocused] = useState(value);
  const [direction, setDirection] = useState(0);
  const moveFocusRef = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const titleId = `${id}-month`;

  // Wartość zmieniona z zewnątrz (np. przesunięcie terminu z przeszłości) – pokaż jej miesiąc.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setFocused(value);
    setView(monthOf(value));
  }

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, view]);

  const minMonth = monthOf(today);
  const canGoBack = compareMonths(view, minMonth) > 0;

  const showMonth = (next: MonthRef) => {
    setDirection(Math.sign(compareMonths(next, view)));
    setView(next);
    // Fokus w siatce zostaje na sensownym dniu nowego miesiąca: wybranym, dziś albo 1.
    const first = `${next.year}-${String(next.month + 1).padStart(2, "0")}-01`;
    const candidate = monthOf(value).month === next.month && monthOf(value).year === next.year ? value : first;
    setFocused(candidate < today ? today : candidate);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const next = moveDate(focused, event.key, today);
    if (next === null) return;
    event.preventDefault();
    const nextMonth = monthOf(next);
    if (compareMonths(nextMonth, view) !== 0) setDirection(Math.sign(compareMonths(nextMonth, view)));
    moveFocusRef.current = true;
    setFocused(next);
    setView(nextMonth);
  };

  const slide = reduceMotion ? 0 : direction * 12;

  return (
    <div className="flex flex-col gap-2" data-testid="date-picker">
      <div className="flex items-center justify-between">
        <button type="button" className={navButton} onClick={() => showMonth(shiftMonth(view, -1))} disabled={!canGoBack} aria-label="Poprzedni miesiąc">
          <ChevronLeft aria-hidden className="size-4" strokeWidth={2} />
        </button>
        <h4 id={titleId} aria-live="polite" className="text-body font-medium text-text-primary tabular-nums">
          {formatMonth(view)}
        </h4>
        <button type="button" className={navButton} onClick={() => showMonth(shiftMonth(view, 1))} aria-label="Następny miesiąc">
          <ChevronRight aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </div>

      <table ref={gridRef} role="grid" aria-labelledby={titleId} onKeyDown={onKeyDown} className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day.short} scope="col" abbr={day.long} className="pb-1 text-center text-caption font-normal text-text-tertiary">
                {day.short}
              </th>
            ))}
          </tr>
        </thead>
        <motion.tbody
          key={`${view.year}-${view.month}`}
          initial={{ opacity: 0, x: slide }}
          animate={{ opacity: 1, x: 0 }}
          transition={transitionFor(reduceMotion, { duration: duration.feedback, ease: ease.out })}
        >
          {monthGrid(view).map((week, row) => (
            <tr key={row}>
              {week.map((date, col) => {
                if (date === null) return <td key={col} role="gridcell" />;
                const past = date < today;
                const selected = date === value;
                const isToday = date === today;
                return (
                  <td key={date} role="gridcell" aria-selected={selected} className="p-0.5 text-center">
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={date === focused ? 0 : -1}
                      aria-label={formatDayLabel(date)}
                      aria-current={isToday ? "date" : undefined}
                      aria-disabled={past || undefined}
                      onClick={() => {
                        if (past) return;
                        setFocused(date);
                        onChange(date);
                      }}
                      className={[
                        "mx-auto grid aspect-square w-full max-w-[max(2.25rem,calc(var(--u)*2.1))] place-items-center rounded-full text-body tabular-nums transition-[background-color,color,scale] duration-(--dur-feedback) ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white",
                        selected
                          ? "bg-amber font-medium text-[rgb(20_14_8)]"
                          : past
                            ? "cursor-default text-text-tertiary opacity-50"
                            : "text-text-primary hover:bg-white/10 active:scale-90",
                        isToday && !selected ? "ring-1 ring-white/50 ring-inset" : "",
                      ].join(" ")}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
