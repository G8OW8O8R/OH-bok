"use client";

import { Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Window, WindowScroll } from "@/components/system/Window";
import { spring, transitionFor } from "@/lib/motion";
import { MAX_ITEM_NAME, type ShoppingItem } from "@/lib/shopping/list";

interface ShoppingAppProps {
  items: ShoppingItem[];
  onAdd: (name: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Po odhaczeniu przekreślenie rysuje się, a dopiero potem pozycja zsuwa się do „Kupione”. */
const SETTLE_MS = 380;

/** Okno listy zakupów: dodawanie, odhaczanie (przekreślenie się rysuje), usuwanie. */
export function ShoppingApp(props: ShoppingAppProps) {
  return (
    <Window id="shopping">
      <ShoppingEditor {...props} />
    </Window>
  );
}

function ShoppingEditor({ items, onAdd, onToggle, onRemove }: ShoppingAppProps) {
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState("");
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };

  const toggle = (item: ShoppingItem) => {
    if (!item.done && !reduceMotion) {
      setSettling((current) => new Set(current).add(item.id));
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        setSettling((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }, SETTLE_MS);
      timers.current.add(timer);
    }
    onToggle(item.id);
  };

  // Pozycja dopiero odhaczona zostaje chwilę w „do kupienia”, żeby było widać rysowanie linii.
  const todo = items.filter((item) => !item.done || settling.has(item.id));
  const bought = items.filter((item) => item.done && !settling.has(item.id));
  const boughtCount = items.filter((item) => item.done).length;

  return (
    <>
      {/* Pole dodawania stoi nad przewijaną listą: zawsze osiągalne. */}
      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 px-6 pb-4">
        <input
          data-autofocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_ITEM_NAME}
          autoComplete="off"
          aria-label="Nowa pozycja"
          placeholder="Dodaj do listy…"
          className="field flex-1 text-body"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-pill bg-amber px-4 py-2.5 text-body font-medium text-[rgb(20_14_8)] transition-[scale] duration-(--dur-feedback) ease-out hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2.5} />
          Dodaj
        </button>
      </form>

      <WindowScroll className="flex flex-col gap-5">
        {items.length === 0 && <p className="text-body text-text-secondary">Lista jest pusta. Dodaj pierwszą pozycję.</p>}

        <ItemGroup label="Do kupienia" items={todo} reduceMotion={reduceMotion} onToggle={toggle} onRemove={onRemove} />
        {boughtCount > 0 && (
          <ItemGroup
            label={`Kupione · ${boughtCount}`}
            items={bought}
            reduceMotion={reduceMotion}
            onToggle={toggle}
            onRemove={onRemove}
          />
        )}
      </WindowScroll>
    </>
  );
}

interface ItemGroupProps {
  label: string;
  items: ShoppingItem[];
  reduceMotion: boolean | null;
  onToggle: (item: ShoppingItem) => void;
  onRemove: (id: string) => void;
}

function ItemGroup({ label, items, reduceMotion, onToggle, onRemove }: ItemGroupProps) {
  const transition = transitionFor(reduceMotion, spring.default);
  return (
    <section aria-label={label}>
      <h3 className="mb-1 text-caption tracking-wide text-text-secondary uppercase">{label}</h3>
      <ul className="flex flex-col">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout={reduceMotion ? false : "position"}
              layoutId={`shopping-item-${item.id}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={transition}
              className="flex items-center gap-3 py-1"
            >
              <Checkbox checked={item.done} onChange={() => onToggle(item)} aria-label={item.name} />
              <span className="relative inline-block max-w-full min-w-0 flex-1 align-top">
                <span className={`block truncate text-body ${item.done ? "text-text-secondary" : "text-text-primary"}`}>
                  {item.name}
                </span>
                {/* Przekreślenie rysuje się liniowo: `text-decoration` się nie animuje. */}
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ scaleX: item.done ? 1 : 0 }}
                  transition={transitionFor(reduceMotion, spring.snappy)}
                  className="absolute top-1/2 left-0 h-px w-full origin-left bg-white/70"
                />
                {item.done && <span className="sr-only"> (kupione)</span>}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Usuń: ${item.name}`}
                className="grid size-8 shrink-0 place-items-center rounded-full text-text-tertiary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary"
              >
                <X aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
