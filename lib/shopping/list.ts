import { z } from "zod";

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
