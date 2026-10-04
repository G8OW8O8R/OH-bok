import { z } from "zod";
import { fold } from "@/lib/commands/text";

export const MAX_ITEM_NAME = 60;
export const MAX_ITEMS = 100;

export const shoppingItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(MAX_ITEM_NAME),
  done: z.boolean(),
});

export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/** Pozycje na pierwszą wizytę (potem lista należy do użytkownika). */
export const STARTER_ITEMS: ShoppingItem[] = [
  { id: "starter-jajka", name: "Jajka", done: false },
  { id: "starter-mleko", name: "Mleko", done: true },
  { id: "starter-chleb", name: "Chleb", done: true },
  { id: "starter-maslo", name: "Masło", done: true },
];

const key = (name: string) => name.trim().toLocaleLowerCase("pl");

/**
 * Dopisuje pozycje, których jeszcze nie ma na liście (bez względu na wielkość liter),
 * do limitu `MAX_ITEMS`. Pozycja już kupiona wraca do „do kupienia”.
 */
export function addItems(items: ShoppingItem[], names: string[], newId: () => string): ShoppingItem[] {
  const next = [...items];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_ITEM_NAME);
    if (!name) continue;
    const existing = next.findIndex((item) => key(item.name) === key(name));
    const found = next[existing];
    if (found) {
      if (found.done) next[existing] = { ...found, done: false };
    } else if (next.length < MAX_ITEMS) {
      next.push({ id: newId(), name, done: false });
    }
  }
  return next;
}

export function toggleItem(items: ShoppingItem[], id: string): ShoppingItem[] {
  return items.map((item) => (item.id === id ? { ...item, done: !item.done } : item));
}

export function removeItem(items: ShoppingItem[], id: string): ShoppingItem[] {
  return items.filter((item) => item.id !== id);
}

/** Najpierw to, co zostało do kupienia; kupione niżej (kolejność dodania zachowana). */
export function splitItems(items: ShoppingItem[]): { todo: ShoppingItem[]; done: ShoppingItem[] } {
  return { todo: items.filter((i) => !i.done), done: items.filter((i) => i.done) };
}

export function remainingCount(items: ShoppingItem[]): number {
  return items.filter((i) => !i.done).length;
}

/**
 * Pozycja listy pasująca do nazwy z komendy („usuń chleba” → „Chleb”): najpierw dokładnie, potem
 * po rdzeniu – krótsza nazwa bez ostatniej litery jest początkiem dłuższej, a długości różnią się
 * najwyżej o 2 (końcówki fleksyjne, nie inne słowa: „masło” ≠ „maślanka”).
 */
export function findItem(items: readonly ShoppingItem[], name: string): ShoppingItem | null {
  const target = fold(name);
  const exact = items.find((item) => fold(item.name) === target);
  if (exact) return exact;
  return (
    items.find((item) => {
      const candidate = fold(item.name);
      const [shorter, longer] = candidate.length <= target.length ? [candidate, target] : [target, candidate];
      return shorter.length >= 3 && longer.length - shorter.length <= 2 && longer.startsWith(shorter.slice(0, -1));
    }) ?? null
  );
}

/** Zmiana listy przez dodanie: nowe pozycje i te, które wróciły z „kupione”. */
export interface AddChange {
  created: string[];
  reopened: string[];
}

export function addChange(before: readonly ShoppingItem[], after: readonly ShoppingItem[]): AddChange {
  const previous = new Map(before.map((item) => [item.id, item]));
  return {
    created: after.filter((item) => !previous.has(item.id)).map((item) => item.id),
    reopened: after.filter((item) => previous.get(item.id)?.done && !item.done).map((item) => item.id),
  };
}

/** „Cofnij” dodawanie: nowe pozycje znikają, przywrócone wracają do „kupione”. */
export function revertAdd(items: readonly ShoppingItem[], change: AddChange): ShoppingItem[] {
  const created = new Set(change.created);
  const reopened = new Set(change.reopened);
  return items.filter((item) => !created.has(item.id)).map((item) => (reopened.has(item.id) ? { ...item, done: true } : item));
}

/** „Cofnij” usunięcie: pozycja wraca na swoje miejsce. */
export function restoreItem(items: readonly ShoppingItem[], item: ShoppingItem, index: number): ShoppingItem[] {
  if (items.some((existing) => existing.id === item.id)) return [...items];
  const next = [...items];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}
