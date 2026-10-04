"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef, type KeyboardEvent } from "react";
import { Glass } from "@/components/ui/Glass";
import { spring, transitionFor } from "@/lib/motion";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  /** Prefiks identyfikatorów: zakładka `${idPrefix}-tab-${id}`, panel `${idPrefix}-panel-${id}`. */
  idPrefix: string;
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * Kapsuła zakładek (ornament nad oknem): ARIA `tablist`, strzałki / Home / End przełączają
 * i przenoszą fokus (aktywacja automatyczna), aktywna zakładka ma jaśniejsze tło, które
 * przesuwa się sprężyną.
 */
export function Tabs<T extends string>({ idPrefix, label, items, value, onChange }: TabsProps<T>) {
  const reduceMotion = useReducedMotion();
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent) => {
    const index = items.findIndex((item) => item.id === value);
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % items.length
      : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    const item = items[next];
    if (!item) return;
    event.preventDefault();
    onChange(item.id);
    refs.current.get(item.id)?.focus();
  };

  return (
    <Glass depth="mid" parallax={false} className="rounded-pill p-1">
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1">
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              ref={(element) => {
                if (element) refs.current.set(item.id, element);
                else refs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={tabId(idPrefix, item.id)}
              aria-selected={selected}
              aria-controls={tabPanelId(idPrefix, item.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={`relative rounded-pill px-4 py-1.5 text-body transition-colors duration-(--dur-feedback) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber pointer-coarse:py-2.5 ${selected ? "text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
            >
              {selected && (
                <motion.span
                  aria-hidden
                  layoutId={`${idPrefix}-tab-pill`}
                  transition={transitionFor(reduceMotion, spring.snappy)}
                  className="absolute inset-0 rounded-pill bg-white/14"
                />
              )}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>
    </Glass>
  );
}
