"use client";

import { setStorageMode } from "@/lib/storage";
import { useAlertsStore } from "@/store/alerts";
import { useMarketsStore } from "@/store/markets";
import { useRemindersStore } from "@/store/reminders";
import { useShoppingStore } from "@/store/shopping";
import { useWindowsStore } from "@/store/windows";

/**
 * Dane trybu demo: store'y piszą do pamięci (`lib/storage.ts`), więc wycieczka działa na
 * kopii z danymi startowymi. Rynki nie są zerowane (ceny i stan kanału na żywo), tylko wczytywane
 * na nowo przy wyjściu – waluta i kurs użytkownika wracają z localStorage.
 */
function resetToInitial() {
  // Zapis idzie jeszcze do pamięci: localStorage użytkownika nie widzi pustych stanów.
  useShoppingStore.setState(useShoppingStore.getInitialState(), true);
  useRemindersStore.setState(useRemindersStore.getInitialState(), true);
  useAlertsStore.setState(useAlertsStore.getInitialState(), true);
  useWindowsStore.setState(useWindowsStore.getInitialState(), true);
}

/** Nowe okrążenie wycieczki: świeże dane startowe (komendy z poprzedniego okrążenia znikają). */
export function resetDemoData(now: Date, timeZone: string): void {
  resetToInitial();
  useShoppingStore.getState().seedIfFirstVisit();
  useRemindersStore.getState().seedIfFirstVisit(now, timeZone);
}

/** Koniec demo: dane demo znikają, store'y wczytują zapis użytkownika z localStorage. */
export async function restoreUserData(now: Date, timeZone: string): Promise<void> {
  resetToInitial();
  setStorageMode("local");
  await Promise.all([
    useShoppingStore.persist.rehydrate(),
    useRemindersStore.persist.rehydrate(),
    useAlertsStore.persist.rehydrate(),
    useWindowsStore.persist.rehydrate(),
    useMarketsStore.persist.rehydrate(),
  ]);
  // Pierwsza wizyta od razu w demo: dane startowe jak przy zwykłym wejściu.
  useShoppingStore.getState().seedIfFirstVisit();
  useRemindersStore.getState().seedIfFirstVisit(now, timeZone);
}
