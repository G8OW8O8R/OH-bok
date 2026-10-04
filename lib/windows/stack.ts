import type { AppId } from "./apps";

/**
 * Stos otwartych okien od spodu do wierzchu: ostatnie = aktywne (fokus, najwyższa warstwa).
 * Funkcje zwracają tę samą tablicę, gdy nic się nie zmienia (bez zbędnych renderów i wpisów historii).
 */
export type WindowStack = readonly AppId[];

/** Otwiera okno albo, jeśli już jest otwarte, podnosi je na wierzch. */
export function openWindow(stack: WindowStack, id: AppId): WindowStack {
  if (stack[stack.length - 1] === id) return stack;
  return [...stack.filter((open) => open !== id), id];
}

/** Podnosi otwarte okno na wierzch; zamkniętego nie otwiera. */
export function focusWindow(stack: WindowStack, id: AppId): WindowStack {
  return stack.includes(id) ? openWindow(stack, id) : stack;
}

export function closeWindow(stack: WindowStack, id: AppId): WindowStack {
  return stack.includes(id) ? stack.filter((open) => open !== id) : stack;
}

export function topWindow(stack: WindowStack): AppId | null {
  return stack[stack.length - 1] ?? null;
}

/**
 * Przełączanie okien (F6): okno ze spodu wychodzi na wierzch; wstecz (Shift+F6) okno z wierzchu
 * schodzi na spód. Kolejne naciśnięcia przechodzą przez wszystkie okna, nie tylko dwa ostatnie.
 */
export function cycleWindows(stack: WindowStack, backwards = false): WindowStack {
  if (stack.length < 2) return stack;
  return backwards ? [...stack.slice(-1), ...stack.slice(0, -1)] : [...stack.slice(1), ...stack.slice(0, 1)];
}

/**
 * Okna, które widać. Na telefonie i tablecie okno to arkusz na pełny ekran, więc widać tylko
 * ten na wierzchu (pozostałe zostają w adresie i wracają po jego zamknięciu).
 */
export function visibleWindows(stack: WindowStack, sheets: boolean): WindowStack {
  if (!sheets || stack.length <= 1) return stack;
  return stack.slice(-1);
}

/** Warstwa okna: nad tłem pulpitu, kolejne okna wyżej. */
export function windowLayer(stack: WindowStack, id: AppId, base: number): number {
  const index = stack.indexOf(id);
  return index < 0 ? base : base + index;
}

export function sameStack(a: WindowStack, b: WindowStack): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id);
}
