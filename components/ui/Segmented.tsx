"use client";

import { useRef, type KeyboardEvent } from "react";

export interface SegmentItem<T extends string> {
  id: T;
  label: string;
  /** Pełna nazwa dla czytników, gdy etykieta jest skrótem („1T” → „tydzień”). */
  description?: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  label: string;
  items: readonly SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Podpowiedź przy wyłączonej opcji (np. „brak kursu NBP”). */
  title?: string;
  className?: string;
}

/**
 * Przełącznik jednej z kilku opcji (waluta, zakres wykresu): ARIA `radiogroup`, strzałki
 * zmieniają wybór, aktywna opcja w bursztynie (jeden ciepły akcent = stan aktywny).
 */
export function Segmented<T extends string>({ label, items, value, onChange, title, className }: SegmentedProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const enabled = items.filter((item) => !item.disabled);

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || enabled.length === 0) return;
    event.preventDefault();
    const index = enabled.findIndex((item) => item.id === value);
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.id);
    refs.current.get(next.id)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      title={title}
      onKeyDown={onKeyDown}
      className={`flex shrink-0 gap-0.5 rounded-pill bg-white/8 p-0.5 ${className ?? ""}`}
    >
      {items.map((item) => {
        const checked = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              if (element) refs.current.set(item.id, element);
              else refs.current.delete(item.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={item.description ? `${item.label} – ${item.description}` : undefined}
            disabled={item.disabled}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={`min-w-10 rounded-pill px-3 py-1 text-caption font-medium tabular-nums transition-colors duration-(--dur-feedback) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-9 ${checked ? "bg-amber text-[rgb(20_14_8)]" : "text-white/82 hover:text-text-primary"}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
