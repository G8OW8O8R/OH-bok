"use client";

import { useEffect, useState } from "react";
import { REMINDERS_STORAGE_KEY, useRemindersStore } from "@/store/reminders";
import { SHOPPING_STORAGE_KEY, useShoppingStore } from "@/store/shopping";

/**
 * Wczytuje listę i przypomnienia z localStorage dopiero po hydracji (HTML z serwera zgadza się
 * z pierwszym renderem), wstawia dane startowe przy pierwszej wizycie i pilnuje zgodności między
 * kartami (zdarzenie `storage`). Zwraca `true`, gdy dane są gotowe.
 */
export function usePlannerSync(timeZone: string): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([useShoppingStore.persist.rehydrate(), useRemindersStore.persist.rehydrate()]).then(() => {
      if (cancelled) return;
      useShoppingStore.getState().seedIfFirstVisit();
      useRemindersStore.getState().seedIfFirstVisit(new Date(), timeZone);
      setReady(true);
    });

    const onStorage = (event: StorageEvent) => {
      if (event.key === SHOPPING_STORAGE_KEY) void useShoppingStore.persist.rehydrate();
      if (event.key === REMINDERS_STORAGE_KEY) void useRemindersStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
    // Strefa liczy się tylko przy pierwszym wstawieniu danych startowych.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
