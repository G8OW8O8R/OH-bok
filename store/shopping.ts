"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStorage } from "@/lib/storage";
import { addItems, removeItem, shoppingItemSchema, STARTER_ITEMS, toggleItem, type ShoppingItem } from "@/lib/shopping/list";

interface ShoppingState {
  items: ShoppingItem[];
  /** Dane startowe wstawiamy tylko raz: pusta lista użytkownika nie wraca do przykładów. */
  seeded: boolean;
  /** Zwraca liczbę faktycznie dodanych pozycji. */
  add: (names: string[]) => number;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  /** Podmiana całej listy („Cofnij” w Spotlighcie: `revertAdd`, `restoreItem`). */
  replace: (items: ShoppingItem[]) => void;
  seedIfFirstVisit: () => void;
}

export const SHOPPING_STORAGE_KEY = "obok-shopping";

const persistedSchema = z.object({
  items: z.array(shoppingItemSchema),
  seeded: z.boolean(),
});

type PersistedShopping = z.infer<typeof persistedSchema>;

const newId = () => `item-${crypto.randomUUID()}`;

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => ({
      items: [],
      seeded: false,
      add: (names) => {
        const before = get().items;
        const items = addItems(before, names, newId);
        set({ items });
        return items.length - before.length;
      },
      toggle: (id) => set({ items: toggleItem(get().items, id) }),
      remove: (id) => set({ items: removeItem(get().items, id) }),
      replace: (items) => set({ items }),
      seedIfFirstVisit: () => {
        if (!get().seeded) set({ items: STARTER_ITEMS, seeded: true });
      },
    }),
    {
      name: SHOPPING_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ items, seeded }): PersistedShopping => ({ items, seeded }),
      // localStorage to dane z zewnątrz: uszkodzony lub stary zapis = stan domyślny, nie crash.
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      skipHydration: true,
    },
  ),
);
