/**
 * Sygnał „sekwencja startowa zakończona”. Do tej chwili strona się ładuje i dekoduje,
 * więc pomiary płynności (watchdog kuli) nie mają sensu.
 *
 * Do czasu choreografii uruchamiania (zadanie 5) koniec startu = pierwsza klatka wideo
 * sceny + chwila bezczynności, z limitem bezpieczeństwa. Komponent Boot wywoła `markBootDone()`
 * po kodzie sekwencji i nic więcej nie trzeba zmieniać.
 */

type Listener = () => void;

let done = false;
const listeners = new Set<Listener>();

export function isBootDone(): boolean {
  return done;
}

export function markBootDone(): void {
  if (done) return;
  done = true;
  for (const listener of listeners) listener();
  listeners.clear();
}

/** Wywołuje `listener` po zakończeniu startu (od razu, jeśli już się skończył). Zwraca wypisanie. */
export function onBootDone(listener: Listener): () => void {
  if (done) {
    listener();
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Maks. czas oczekiwania na bezczynność po pierwszej klatce sceny. */
export const BOOT_IDLE_TIMEOUT_MS = 2000;
/** Gdy wideo nie ruszy wcale (np. tryb oszczędzania energii), start i tak się kończy. */
export const BOOT_SAFETY_MS = 8000;

/** Tymczasowy koniec startu: pierwsza chwila bezczynności po pierwszej klatce sceny. */
export function scheduleBootDone(): void {
  if (done || typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(markBootDone, { timeout: BOOT_IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(markBootDone, 500);
  }
}

/** Tylko do testów jednostkowych. */
export function resetBootForTests(): void {
  done = false;
  listeners.clear();
}
