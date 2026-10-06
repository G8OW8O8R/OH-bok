import type { StateStorage } from "zustand/middleware";
import { isDemoSearch } from "@/lib/demo/mode";

/**
 * Zapis store'ów z danymi użytkownika (lista, przypomnienia, alerty, okna, waluta Rynków).
 * Zwykle localStorage; w trybie demo (`?demo=1`) mapa w pamięci karty – wycieczka może dodawać
 * przypomnienia i otwierać okna, a zapis użytkownika zostaje nietknięty.
 *
 * Tryb wybierany przy wczytaniu modułu (przed rehydracją store'ów), zmieniany przy wyjściu z demo.
 */
type Mode = "local" | "memory";

const memory = new Map<string, string>();
let mode: Mode = typeof window !== "undefined" && isDemoSearch(window.location.search) ? "memory" : "local";

function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Zablokowane ciasteczka / tryb prywatny bez localStorage: zachowanie jak bez zapisu.
    return null;
  }
}

export const appStorage: StateStorage = {
  getItem: (name) => (mode === "memory" ? (memory.get(name) ?? null) : (local()?.getItem(name) ?? null)),
  setItem: (name, value) => {
    if (mode === "memory") memory.set(name, value);
    else local()?.setItem(name, value);
  },
  removeItem: (name) => {
    if (mode === "memory") memory.delete(name);
    else local()?.removeItem(name);
  },
};

export function storageMode(): Mode {
  return mode;
}

/** Przełącza zapis; wyjście z pamięci czyści dane demo. */
export function setStorageMode(next: Mode): void {
  if (next === "local") memory.clear();
  mode = next;
}
