"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { duration, ease, transitionFor } from "@/lib/motion";
import { useBootState } from "@/lib/use-boot";
import { openerElementId, type AppId, type WindowOrigin } from "@/lib/windows/apps";
import {
  closeWindow,
  cycleWindows,
  focusWindow,
  openWindow,
  topWindow,
  visibleWindows,
  type WindowStack,
} from "@/lib/windows/stack";
import { closeNavigation, searchWithStack, stackFromSearch } from "@/lib/windows/url";
import { useWindowsStore } from "@/store/windows";

/** Wpis historii dodany przy otwarciu okna (Next dokleja do niego własny stan routera). */
interface WindowHistoryState {
  obokApp?: AppId | null;
}

interface WindowsContextValue {
  /** Otwarte okna od spodu do wierzchu (z adresu `?app=`). */
  stack: WindowStack;
  /** Okna widoczne teraz (na telefonie tylko to z wierzchu). */
  visible: WindowStack;
  /** Okno to arkusz na pełny ekran (< 1024 px). */
  sheets: boolean;
  /** Skąd otwarto okno (przejście współdzielone); null = z linku albo „dalej” w historii. */
  originOf: (id: AppId) => WindowOrigin | null;
  /** `history: "replace"` – bez wpisu w historii (tryb demo: „wstecz” nie przechodzi przez jego okna). */
  open: (id: AppId, origin: WindowOrigin, options?: { history?: "push" | "replace" }) => void;
  close: (id: AppId) => void;
  focus: (id: AppId) => void;
}

const WindowsContext = createContext<WindowsContextValue | null>(null);

export function useWindows(): WindowsContextValue {
  const context = useContext(WindowsContext);
  if (!context) throw new Error("useWindows wymaga <WindowsProvider>");
  return context;
}

const SHEETS_QUERY = "(max-width: 1023.98px)";

function subscribeSheets(onChange: () => void): () => void {
  const query = window.matchMedia(SHEETS_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useSheets(): boolean {
  return useSyncExternalStore(subscribeSheets, () => window.matchMedia(SHEETS_QUERY).matches, () => false);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function windowElement(id: AppId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-window="${id}"]`);
}

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/** Fokus w oknie: ostatnio aktywny element, pole z `data-autofocus` albo pierwszy przycisk. */
function focusWindowContent(id: AppId, remembered: HTMLElement | undefined) {
  const root = windowElement(id);
  if (!root || root.contains(document.activeElement)) return;
  const target =
    (remembered?.isConnected && root.contains(remembered) ? remembered : null) ??
    root.querySelector<HTMLElement>("[data-autofocus]") ??
    focusableIn(root)[0] ??
    root;
  target.focus({ preventScroll: true });
}

/**
 * Kod okien wczytuje się leniwie (`next/dynamic` w Desktop.tsx): okno otwarte przed jego wczytaniem
 * pojawia się w DOM kilka klatek później. Fokus czeka na nie (maks. ok. 3 s), dopóki jest na wierzchu.
 */
function focusWhenMounted(id: AppId, remembered: () => HTMLElement | undefined, stillTop: () => boolean, frames = 180) {
  requestAnimationFrame(() => {
    if (!stillTop()) return;
    if (windowElement(id)) focusWindowContent(id, remembered());
    else if (frames > 0) focusWhenMounted(id, remembered, stillTop, frames - 1);
  });
}

const NO_WINDOWS: WindowStack = [];
/** `pushState`/`replaceState` nie wywołują `popstate`: własne zdarzenie dla subskrybentów adresu. */
const LOCATION_EVENT = "obok:location";

function subscribeLocation(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(LOCATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(LOCATION_EVENT, onChange);
  };
}

const readSearch = () => window.location.search;
const readServerSearch = () => "";
const currentStack = () => stackFromSearch(window.location.search);

function navigate(mode: "push" | "replace", stack: WindowStack, state: unknown) {
  const url = `${window.location.pathname}${searchWithStack(window.location.search, stack)}`;
  if (mode === "push") window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

/**
 * Podmiana parametrów adresu bez wpisu w historii (np. koniec trybu demo: bez `demo` i `app`).
 * Okna subskrybują adres, więc usunięcie `app` je zamyka.
 */
export function replaceSearchParams(update: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  update(params);
  const query = params.toString().replace(/%2C/gi, ",");
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

/**
 * System okien: stos okien zapisany w adresie (`?app=pogoda,lista`), „wstecz”
 * zamyka okno, fokus i kolejność warstw, Esc i F6, powrót fokusu do ikony albo kafelka.
 * Okna z linku otwierają się dopiero po sekwencji startu (pozycja jest w localStorage, a okno
 * nie może zasłonić odsłaniania sceny).
 */
export function WindowsProvider({ children }: { children: ReactNode }) {
  const boot = useBootState();
  const sheets = useSheets();
  const ready = boot.phase === "done";
  // Adres jest jedynym źródłem prawdy o otwartych oknach (link, „wstecz”, „dalej”).
  const search = useSyncExternalStore(subscribeLocation, readSearch, readServerSearch);
  const stack = useMemo(() => (ready ? stackFromSearch(search) : NO_WINDOWS), [ready, search]);
  const [origins, setOrigins] = useState<Partial<Record<AppId, WindowOrigin>>>({});
  const openers = useRef(new Map<AppId, HTMLElement>());
  const lastFocused = useRef(new Map<AppId, HTMLElement>());
  const previous = useRef<WindowStack>(NO_WINDOWS);

  // Po starcie: zapamiętane pozycje z localStorage (okna z adresu montują się w tym samym kroku).
  useEffect(() => {
    if (ready) void useWindowsStore.persist.rehydrate();
  }, [ready]);

  const open = useCallback((id: AppId, origin: WindowOrigin, options?: { history?: "push" | "replace" }) => {
    const current = currentStack();
    const next = openWindow(current, id);
    if (next === current) return;
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest("[data-window]")) {
      openers.current.set(id, document.activeElement);
    }
    if (current.includes(id)) {
      navigate("replace", next, window.history.state);
    } else {
      setOrigins((value) => ({ ...value, [id]: origin }));
      if (options?.history === "replace") navigate("replace", next, window.history.state);
      else navigate("push", next, { obokApp: id } satisfies WindowHistoryState);
    }
  }, []);

  const close = useCallback((id: AppId) => {
    const current = currentStack();
    if (!current.includes(id)) return;
    const entry = (window.history.state as WindowHistoryState | null)?.obokApp;
    // Wpis z otwarcia tego okna: cofamy go (to samo co „wstecz”), stan przyjdzie z `popstate`.
    if (closeNavigation(current, id, entry) === "back") {
      window.history.back();
      return;
    }
    const next = closeWindow(current, id);
    const keep = entry && next.includes(entry) ? entry : null;
    navigate("replace", next, { ...(window.history.state as object | null), obokApp: keep });
  }, []);

  const focus = useCallback((id: AppId) => {
    const current = currentStack();
    const next = focusWindow(current, id);
    // Zmiana kolejności nie dodaje wpisu historii: „wstecz” dalej zamyka okna.
    if (next !== current) navigate("replace", next, window.history.state);
  }, []);

  // Fokus podąża za wierzchem stosu; po zamknięciu ostatniego okna wraca do ikony albo kafelka.
  useEffect(() => {
    const before = previous.current;
    previous.current = stack;
    const top = topWindow(stack);
    if (top) {
      if (topWindow(before) !== top) {
        focusWhenMounted(
          top,
          () => lastFocused.current.get(top),
          () => topWindow(currentStack()) === top,
        );
      }
      return;
    }
    const closed = topWindow(before);
    if (!closed) return;
    lastFocused.current.delete(closed);
    const opener = openers.current.get(closed);
    openers.current.delete(closed);
    const target = opener?.isConnected ? opener : document.getElementById(openerElementId(closed));
    target?.focus({ preventScroll: true });
  }, [stack]);

  // Klawiatura: Esc zamyka okno z wierzchu, Tab krąży w nim, F6 / Shift+F6 przełącza okna.
  useEffect(() => {
    if (stack.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      const current = currentStack();
      const top = topWindow(current);
      if (!top || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(top);
        return;
      }
      if (event.key === "F6" && current.length > 1 && !sheets) {
        event.preventDefault();
        navigate("replace", cycleWindows(current, event.shiftKey), window.history.state);
        return;
      }
      if (event.key !== "Tab") return;
      const root = windowElement(top);
      if (!root) return;
      const items = focusableIn(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (!root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Zapamiętany element z fokusem: po powrocie na wierzch okno wraca tam, gdzie było.
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const id = event.target.closest<HTMLElement>("[data-window]")?.dataset.window as AppId | undefined;
      if (id) lastFocused.current.set(id, event.target);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [stack.length, sheets, close]);

  // Strona pod oknem się nie przewija (na telefonie arkusz zajmuje cały ekran).
  useEffect(() => {
    if (stack.length === 0) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, [stack.length]);

  const visible = useMemo(() => visibleWindows(stack, sheets), [stack, sheets]);
  const originOf = useCallback((id: AppId) => origins[id] ?? null, [origins]);
  const value = useMemo(
    () => ({ stack, visible, sheets, originOf, open, close, focus }),
    [stack, visible, sheets, originOf, open, close, focus],
  );

  return <WindowsContext.Provider value={value}>{children}</WindowsContext.Provider>;
}

/**
 * Pulpit cofa się za okna: przyciemnienie + stałe rozmycie (animowane tylko krycie).
 * Klik w tło zamyka okno z wierzchu.
 */
export function WindowBackdrop() {
  const { stack, close } = useWindows();
  const reduceMotion = useReducedMotion();
  const top = topWindow(stack);
  return (
    <AnimatePresence>
      {top && (
        <motion.button
          key="backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Zamknij okno"
          onClick={() => close(top)}
          data-testid="panel-backdrop"
          className="panel-backdrop fixed inset-0 z-40 cursor-default"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitionFor(reduceMotion, { duration: duration.feedback, ease: ease.soft })}
        />
      )}
    </AnimatePresence>
  );
}
