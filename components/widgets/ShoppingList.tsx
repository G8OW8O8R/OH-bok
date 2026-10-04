"use client";

import { Plus } from "lucide-react";
import { Glass } from "@/components/ui/Glass";
import { originLayoutId } from "@/lib/windows/apps";
import { splitItems, type ShoppingItem } from "@/lib/shopping/list";
import { ProgressRing } from "./ProgressRing";

interface ShoppingListProps {
  items: ShoppingItem[];
  called: boolean;
  /** Otwiera okno aplikacji, które rozwija się z kafelka (przejście współdzielone). */
  onOpen: () => void;
}

const VISIBLE = 3;

/** Lista zakupów (środek): zaokrąglony kwadrat, pierścień postępu i najbliższe pozycje. */
export function ShoppingList({ items, called, onOpen }: ShoppingListProps) {
  const { todo, done } = splitItems(items);
  // Najpierw to, co zostało do kupienia; kupione niżej, przekreślone.
  const visible = [...todo, ...done].slice(0, VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <Glass
      layoutId={originLayoutId("shopping", "tile")}
      depth="mid"
      role="region"
      aria-labelledby="shopping-title"
      id="shopping"
      tabIndex={-1}
      data-testid="shopping-list"
      data-called={called || undefined}
      onDoubleClick={onOpen}
      className="flex h-53.5 w-(--column-width) shrink-0 flex-col items-center rounded-widget px-4 pt-5 pb-4 desk:w-53.5"
    >
      <h2 id="shopping-title" className="text-title font-medium text-text-primary">
        Lista zakupów
      </h2>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Otwórz listę zakupów"
        title="Otwórz listę zakupów"
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-text-secondary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary"
      >
        <Plus aria-hidden className="size-4.5" strokeWidth={1.75} />
      </button>
      {/* Pełna szerokość kafelka: pierścień nie przesuwa się, gdy po wczytaniu listy zmienia się szerokość tekstu. */}
      <div className="flex w-full max-w-[calc(var(--u)*14)] flex-1 items-center gap-4">
        <ProgressRing value={done.length} total={items.length} className="size-26 shrink-0" />
        {/* Stała wysokość na 3 pozycje + „+n więcej”: wczytanie listy z localStorage nie przesuwa układu. */}
        <ul className="flex min-h-[calc(var(--u)*6.3)] min-w-0 flex-1 flex-col justify-center gap-1 text-body">
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
          {items.length === 0 && <li className="text-caption text-text-secondary">Lista jest pusta</li>}
          {hidden > 0 && <li className="text-caption whitespace-nowrap text-text-secondary">+{hidden} więcej</li>}
        </ul>
      </div>
    </Glass>
  );
}
