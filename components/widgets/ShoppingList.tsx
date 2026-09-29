"use client";

import { Glass } from "@/components/ui/Glass";
import type { ShoppingItem } from "@/lib/desktop/sample";
import { ProgressRing } from "./ProgressRing";

interface ShoppingListProps {
  items: ShoppingItem[];
  called: boolean;
}

const VISIBLE = 3;

/** Lista zakupów (środek): zaokrąglony kwadrat, pierścień postępu i najbliższe pozycje. */
export function ShoppingList({ items, called }: ShoppingListProps) {
  const done = items.filter((item) => item.done).length;
  // Najpierw to, co zostało do kupienia; kupione niżej, przekreślone.
  const visible = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)].slice(0, VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <Glass
      depth="mid"
      role="region"
      aria-labelledby="shopping-title"
      id="shopping"
      tabIndex={-1}
      data-testid="shopping-list"
      data-called={called || undefined}
      className="flex size-53.5 shrink-0 flex-col items-center rounded-widget px-4 pt-5 pb-4"
    >
      <h2 id="shopping-title" className="text-title font-medium text-text-primary">
        Lista zakupów
      </h2>
      <div className="flex flex-1 items-center gap-4">
        <ProgressRing value={done} total={items.length} className="size-26" />
        <ul className="flex min-w-0 flex-col gap-1 text-body">
          {visible.map((item) => (
            <li
              key={item.id}
              className={
                item.done ? "truncate text-text-secondary line-through decoration-white/40" : "truncate text-text-primary"
              }
            >
              {item.name}
              {item.done && <span className="sr-only"> (kupione)</span>}
            </li>
          ))}
          {hidden > 0 && <li className="text-caption whitespace-nowrap text-text-secondary">+{hidden} więcej</li>}
        </ul>
      </div>
    </Glass>
  );
}
