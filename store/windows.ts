"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStorage } from "@/lib/storage";
import { appIdSchema, type AppId } from "@/lib/windows/apps";
import { savedPositionSchema, type SavedPosition } from "@/lib/windows/position";

/**
 * Zapamiętane pozycje okien (względne, `lib/windows/position.ts`). To, które okna są otwarte,
 * wynika z adresu (`?app=`), nie z localStorage: link i „wstecz” mają pierwszeństwo.
 */
interface WindowsState {
  positions: Partial<Record<AppId, SavedPosition>>;
  setPosition: (id: AppId, position: SavedPosition) => void;
}

export const WINDOWS_STORAGE_KEY = "obok-windows";

const persistedSchema = z.object({
  positions: z.partialRecord(appIdSchema, savedPositionSchema),
});

type PersistedWindows = z.infer<typeof persistedSchema>;

export const useWindowsStore = create<WindowsState>()(
  persist(
    (set, get) => ({
      positions: {},
      setPosition: (id, position) => set({ positions: { ...get().positions, [id]: position } }),
    }),
    {
      name: WINDOWS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ positions }): PersistedWindows => ({ positions }),
      // localStorage to dane z zewnątrz: uszkodzony zapis = okna na domyślnych miejscach.
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      skipHydration: true,
    },
  ),
);
