"use client";

import { AnimatePresence, animate, motion, useReducedMotion, type AnimationPlaybackControls, type MotionValue } from "motion/react";
import { Bell, BellRing, Check, CloudSun, Info, ListPlus, ListX, LoaderCircle, Search, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { OrbFlight } from "@/components/orb/flight";
import { useParallax } from "@/components/ui/Parallax";
import { addDays } from "@/lib/calendar";
import { parseCommand, type Command } from "@/lib/commands/parse";
import {
  EXAMPLE_COMMANDS,
  FALLBACK_EXAMPLES,
  formatCommandWhen,
  isAction,
  progressLabel,
  searchApps,
  type ActionCommand,
} from "@/lib/commands/search";
import { describeAlert } from "@/lib/markets/alerts";
import { displayCurrency, formatPrice, type Currency } from "@/lib/markets/currency";
import { usableFx } from "@/lib/markets/fx";
import { ensureMarketsHydrated } from "@/lib/markets/use-markets";
import { duration, ease, spring, transitionFor } from "@/lib/motion";
import { pluralPl } from "@/lib/plural";
import { addChange, findItem, restoreItem, revertAdd } from "@/lib/shopping/list";
import { weekdayLong } from "@/lib/time";
import type { DailyForecast, WeatherData } from "@/lib/weather/schema";
import { APPS, originLayoutId, type AppId } from "@/lib/windows/apps";
import { useAlertsStore } from "@/store/alerts";
import { useMarketsStore } from "@/store/markets";
import { useRemindersStore } from "@/store/reminders";
import { useShoppingStore } from "@/store/shopping";
import { APP_ICONS } from "./Dock";
import { focusableIn, useWindows } from "./Windows";
import { OutcomeCard, PriceCard, WeatherCard, type OutcomeTone } from "./spotlight/cards";

export type SpotlightPhase = "closed" | "open" | "closing";

interface SpotlightProps {
  phase: SpotlightPhase;
  /** Esc, klik w tło, akcja otwierająca okno: pulpit przechodzi w „closing”. */
  onRequestClose: () => void;
  /** Kula wróciła na miejsce. */
  onClosed: () => void;
  /** Opakowanie kuli w pulpicie (to ono przelatuje – ta sama kula, nie kopia). */
  orbAnchor: React.RefObject<HTMLDivElement | null>;
  flight: OrbFlight & { opacity: MotionValue<number> };
  now: Date;
  timeZone: string;
  weather: WeatherData;
  /** Komenda w trakcie wykonania: kula „myśli”. */
  onBusy: (busy: boolean) => void;
  onPinDay: (date: string) => void;
  announce: (text: string) => void;
}

type Item = { id: string; type: "command"; command: Command } | { id: string; type: "app"; app: AppId };

type Outcome =
  | { ok: true; tone: OutcomeTone; title: string; detail: string; chips?: string[]; undo: (() => void) | null; target: "pill" | "shopping" | null; message: string }
  | { ok: false; error: string };

interface Run {
  key: number;
  command: ActionCommand;
  /** 0 = „Rozumiem polecenie ✓”, 1 = w toku, 2 = gotowe. */
  step: 0 | 1 | 2;
  outcome: Outcome | null;
  undone: boolean;
}

interface Ghost {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  icon: LucideIcon;
  target: Element;
  message: string;
}

const STEP_MS = { working: 280, done: 650, closeAfterPin: 450 } as const;
const LANDING_MS = 1200;
const SHEETS_QUERY = "(max-width: 1023.98px)";

function dayLabel(date: string, today: string): string {
  if (date === today) return "Dziś";
  if (date === addDays(today, 1)) return "Jutro";
  return weekdayLong(date);
}

/** Waluta alertu: z komendy, inaczej waluta wyświetlania z okna Rynków (PLN tylko z kursem). */
function alertCurrency(requested: Currency | null): Currency {
  if (requested) return requested;
  const { currency, fx } = useMarketsStore.getState();
  return displayCurrency(currency, usableFx(fx, new Date())?.rate ?? null);
}

/**
 * Spotlight: pole komendy z lokalnym parserem, wyniki jako mini-karty,
 * chipy postępu i akcje, które lecą do celu. Kula z pulpitu przelatuje na środek u góry i „słucha”.
 * ARIA: combobox + listbox (strzałki, Enter), Esc i klik w tło zamykają, Tab krąży w panelu.
 */
export function Spotlight({ phase, onRequestClose, onClosed, orbAnchor, flight, now, timeZone, weather, onBusy, onPinDay, announce }: SpotlightProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const windows = useWindows();
  const parallax = useParallax("near");
  const open = phase === "open";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const landed = useRef(new Set<Element>());
  const runKey = useRef(0);
  const listId = useId();
  const today = weather.daily[0]?.date ?? "";

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };
  const later = (ms: number, callback: () => void) => {
    timers.current.push(window.setTimeout(callback, ms));
  };

  // Zamknięty Spotlight zaczyna od pustego pola (bez śladu poprzedniej komendy).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
      setRun(null);
    } else {
      setGhost(null);
    }
  }

  useEffect(() => {
    if (open) return;
    clearTimers();
    onBusy(false);
    // Zamknięcie (np. otwarcie okna z wyniku): nic nie zostaje nad tłem ani nad oknem.
    for (const element of landed.current) {
      element.removeAttribute("data-landing");
      element.removeAttribute("data-landing-under");
    }
    landed.current.clear();
  }, [open, onBusy]);

  useEffect(() => () => clearTimers(), []);

  // --- Przelot kuli -------------------------------------------------------------------------------

  useLayoutEffect(() => {
    if (!open) return;
    const flightTarget = () => measureFlight(orbAnchor.current, slotRef.current, flight, parallax);
    const target = flightTarget();
    if (!target) return;
    const controls: AnimationPlaybackControls[] = [];
    if (reduceMotion) {
      // Bez przelotu: kula znika na miejscu i pojawia się u góry.
      controls.push(
        animate(flight.opacity, 0, {
          duration: duration.reducedFade / 2,
          onComplete: () => {
            flight.x.jump(target.x);
            flight.y.jump(target.y);
            controls.push(animate(flight.opacity, 1, { duration: duration.reducedFade / 2 }));
          },
        }),
      );
    } else {
      // Kula przewinięta poza ekran (telefon) wlatuje od górnej krawędzi.
      const offscreen = target.top + target.size < 0 || target.top > window.innerHeight;
      if (offscreen && flight.y.get() === 0) {
        flight.x.jump(target.x);
        flight.y.jump(-target.top - target.size - 24);
      }
      controls.push(animate(flight.x, target.x, spring.gentle), animate(flight.y, target.y, spring.gentle));
    }
    const onResize = () => {
      const next = flightTarget();
      if (!next) return;
      flight.x.jump(next.x);
      flight.y.jump(next.y);
    };
    window.addEventListener("resize", onResize);
    return () => {
      controls.forEach((control) => control.stop());
      window.removeEventListener("resize", onResize);
    };
  }, [open, reduceMotion, flight, parallax, orbAnchor]);

  useEffect(() => {
    if (phase !== "closing") return;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) onClosed();
    };
    const controls: AnimationPlaybackControls[] = [];
    if (reduceMotion) {
      controls.push(
        animate(flight.opacity, 0, {
          duration: duration.reducedFade / 2,
          onComplete: () => {
            flight.x.jump(0);
            flight.y.jump(0);
            controls.push(animate(flight.opacity, 1, { duration: duration.reducedFade / 2, onComplete: finish }));
          },
        }),
      );
    } else {
      const x = animate(flight.x, 0, spring.gentle);
      const y = animate(flight.y, 0, spring.gentle);
      controls.push(x, y);
      void Promise.all([x.finished, y.finished]).then(finish);
    }
    return () => {
      cancelled = true;
      controls.forEach((control) => control.stop());
    };
  }, [phase, reduceMotion, flight, onClosed]);

  // Pod Spotlightem strona się nie przewija; fokus w polu.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  // --- Wyniki -------------------------------------------------------------------------------------

  const command = useMemo(() => parseCommand(query, { now, timeZone }), [query, now, timeZone]);
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    if (command.kind !== "unknown" && command.kind !== "incomplete") list.push({ id: "command", type: "command", command });
    const opened = command.kind === "openApp" ? command.app : null;
    for (const app of searchApps(query)) if (app !== opened) list.push({ id: `app-${app}`, type: "app", app });
    return list;
  }, [command, query]);
  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));
  const activeItem = items[activeIndex] ?? null;
  const optionId = (item: Item) => `${listId}-${item.id}`;
  const dayOf = (date: string): DailyForecast | null => weather.daily.find((day) => day.date === date) ?? null;

  const isDisabled = (item: Item): boolean => {
    if (item.type !== "command") return false;
    const c = item.command;
    if (c.kind === "weather") return dayOf(c.date) === null;
    if (c.kind === "removeItem") return findItem(useShoppingStore.getState().items, c.item) === null;
    return false;
  };

  // --- Wykonanie ----------------------------------------------------------------------------------

  const openApp = (app: AppId) => {
    windows.open(app, "spotlight");
    onRequestClose();
  };

  const land = useCallback(
    (target: Element | null, message: string) => {
      announce(message);
      if (!target) return;
      // Cel wychodzi nad tło, chyba że leży pod panelem (kafelek listy na niskim ekranie) –
      // wtedy tylko zgłasza się obrysem pod rozmyciem, bez nakładania na wyniki.
      const body = panelRef.current?.querySelector(".spotlight-body")?.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const under = body !== undefined && rect.left < body.right && rect.right > body.left && rect.top < body.bottom && rect.bottom > body.top;
      const attribute = under ? "data-landing-under" : "data-landing";
      target.setAttribute(attribute, "");
      landed.current.add(target);
      window.setTimeout(() => {
        target.removeAttribute(attribute);
        landed.current.delete(target);
      }, LANDING_MS);
    },
    [announce],
  );

  const execute = async (c: ActionCommand): Promise<Outcome> => {
    const at = new Date();
    switch (c.kind) {
      case "reminder": {
        const id = useRemindersStore.getState().add({ title: c.title, at: c.at });
        if (!id) return { ok: false, error: "Za dużo przypomnień – usuń któreś w oknie Przypomnień." };
        const when = formatCommandWhen(c.at, at, timeZone);
        return {
          ok: true,
          tone: "reminder",
          title: c.title,
          detail: when,
          undo: () => useRemindersStore.getState().remove(id),
          target: "pill",
          message: `Przypomnienie: ${c.title} · ${when}`,
        };
      }
      case "addItems": {
        const store = useShoppingStore.getState();
        const before = store.items;
        store.add(c.items);
        const change = addChange(before, useShoppingStore.getState().items);
        const count = change.created.length + change.reopened.length;
        if (count === 0) return { ok: true, tone: "items", title: "Już na liście", detail: c.items.join(", "), undo: null, target: "shopping", message: "Te pozycje są już na liście" };
        return {
          ok: true,
          tone: "items",
          title:
            count === c.items.length
              ? "Dodano do listy zakupów"
              : `Dodano ${count} ${pluralPl(count, ["pozycję", "pozycje", "pozycji"])}, reszta już była na liście`,
          detail: c.items.join(", "),
          chips: c.items,
          undo: () => {
            const { items: current, replace } = useShoppingStore.getState();
            replace(revertAdd(current, change));
          },
          target: "shopping",
          message: `Dodano do listy: ${c.items.join(", ")}`,
        };
      }
      case "removeItem": {
        const { items: current, remove } = useShoppingStore.getState();
        const item = findItem(current, c.item);
        if (!item) return { ok: false, error: `Nie ma na liście: ${c.item}` };
        const index = current.indexOf(item);
        remove(item.id);
        return {
          ok: true,
          tone: "removed",
          title: `Usunięto z listy: ${item.name}`,
          detail: "Lista zakupów",
          undo: () => {
            const { items: latest, replace } = useShoppingStore.getState();
            replace(restoreItem(latest, item, index));
          },
          target: "shopping",
          message: `Usunięto z listy: ${item.name}`,
        };
      }
      case "alert": {
        await ensureMarketsHydrated();
        const input = { symbol: c.symbol, condition: c.condition, threshold: c.threshold, currency: alertCurrency(c.currency) };
        if (!useAlertsStore.getState().add(input, at)) return { ok: false, error: "Osiągnięto limit alertów cenowych." };
        const alert = useAlertsStore.getState().alerts.at(-1);
        if (!alert) return { ok: false, error: "Nie udało się ustawić alertu." };
        const text = describeAlert(alert);
        return {
          ok: true,
          tone: "alert",
          title: `Alert: ${text}`,
          detail: "Powiadomię w pigułce, gdy cena dojdzie do progu",
          undo: () => useAlertsStore.getState().remove(alert.id),
          target: "pill",
          message: `Ustawiono alert: ${text}`,
        };
      }
      case "weather":
        onPinDay(c.date);
        return { ok: true, tone: "items", title: "", detail: "", undo: null, target: null, message: "" };
      case "openApp":
        return { ok: true, tone: "items", title: "", detail: "", undo: null, target: null, message: "" };
    }
  };

  const startGhost = (key: number, outcome: Extract<Outcome, { ok: true }>, icon: LucideIcon) => {
    const target =
      outcome.target === "pill" ? document.querySelector('[data-slot="pill"]')
      : outcome.target === "shopping" ? document.getElementById("shopping")
      : null;
    const row = document.getElementById(`${listId}-command`);
    // Na telefonie arkusz zakrywa pulpit, a przy reduced motion nic nie leci: tylko komunikat.
    if (!target || !row || reduceMotion || window.matchMedia(SHEETS_QUERY).matches) {
      land(window.matchMedia(SHEETS_QUERY).matches ? null : target, outcome.message);
      return;
    }
    const from = row.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setGhost({
      key,
      from: { x: from.left + Math.min(from.width / 2, 220), y: from.top + from.height / 2 },
      to: { x: to.left + to.width / 2, y: to.top + to.height / 2 },
      label: outcome.chips?.join(", ") ?? outcome.title,
      icon,
      target,
      message: outcome.message,
    });
  };

  const runAction = (c: ActionCommand) => {
    if (c.kind === "openApp") {
      openApp(c.app);
      return;
    }
    clearTimers();
    runKey.current += 1;
    const key = runKey.current;
    setRun({ key, command: c, step: 0, outcome: null, undone: false });
    onBusy(true);
    later(STEP_MS.working, () => setRun((current) => (current?.key === key ? { ...current, step: 1 } : current)));
    later(STEP_MS.done, () => {
      void execute(c).then((outcome) => {
        if (runKey.current !== key) return;
        setRun((current) => (current?.key === key ? { ...current, step: 2, outcome } : current));
        onBusy(false);
        if (!outcome.ok) return;
        if (c.kind === "weather") {
          later(STEP_MS.closeAfterPin, onRequestClose);
          return;
        }
        startGhost(key, outcome, commandIcon(c));
      });
    });
  };

  const activate = (item: Item | null) => {
    if (!item || isDisabled(item)) return;
    if (item.type === "app") {
      openApp(item.app);
      return;
    }
    // Termin liczony w chwili Enter (zegar pulpitu tyka co 10 s).
    const fresh = parseCommand(query, { now: new Date(), timeZone });
    const c = fresh.kind === item.command.kind ? fresh : item.command;
    if (c.kind === "price") {
      openApp("markets");
      return;
    }
    if (c.kind === "weather") {
      runAction({ ...c, pin: true });
      return;
    }
    if (isAction(c)) runAction(c);
  };

  const undo = () => {
    if (!run?.outcome?.ok || !run.outcome.undo || run.undone) return;
    run.outcome.undo();
    setRun({ ...run, undone: true });
    // Przycisk „Cofnij” znika: fokus wraca do pola, nie na body.
    inputRef.current?.focus();
    announce(`Cofnięto: ${run.outcome.title}`);
  };

  const fill = (text: string) => {
    setQuery(text);
    setActive(0);
    setRun(null);
    inputRef.current?.focus();
  };

  // --- Klawiatura ---------------------------------------------------------------------------------

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const by = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + by + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (run && run.step < 2) return;
      activate(activeItem);
    }
  };

  /** Klawisze nie wychodzą poza panel (Esc okna, Esc podróży w czasie, pułapka Tab okien). */
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      onRequestClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = focusableIn(panelRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // --- Widok --------------------------------------------------------------------------------------

  const fade = transitionFor(reduceMotion, { duration: duration.feedback, ease: ease.soft });
  const rise = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 };
  const unknown = query.trim() !== "" && items.length === 0 && command.kind === "unknown";

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            key="spotlight-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Zamknij Spotlight"
            onClick={onRequestClose}
            data-testid="spotlight-backdrop"
            className="panel-backdrop spotlight-backdrop fixed inset-0 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div
            key="spotlight"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Spotlight: polecenia i wyszukiwanie"
            data-testid="spotlight"
            onKeyDown={onPanelKeyDown}
            className="spotlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: duration.reducedFade } }}
            transition={fade}
          >
            <button
              type="button"
              onClick={onRequestClose}
              aria-label="Zamknij"
              className="glass absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-11 place-items-center rounded-full text-text-primary lg:hidden"
            >
              <X aria-hidden className="size-5" strokeWidth={1.75} />
            </button>
            <div ref={slotRef} aria-hidden className="spotlight-slot" data-testid="spotlight-slot" />
            <motion.div className="spotlight-body" initial={rise} animate={{ opacity: 1, y: 0 }} transition={transitionFor(reduceMotion, spring.default)}>
              <label className="glass spotlight-field" data-depth="near">
                <Search aria-hidden className="size-[max(1.375rem,calc(var(--u)*1.55))] shrink-0 text-white/78" strokeWidth={1.75} />
                <span className="sr-only">Polecenie albo nazwa aplikacji</span>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => fill(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Zapytaj Obok albo wpisz polecenie…"
                  role="combobox"
                  aria-expanded={items.length > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  data-testid="spotlight-input"
                  className="spotlight-input"
                />
              </label>

              {query.trim() === "" && (
                <ul aria-label="Przykłady poleceń" className="spotlight-chips" data-testid="spotlight-examples">
                  {EXAMPLE_COMMANDS.map((example) => (
                    <li key={example}>
                      <ExampleChip text={example} onPick={fill} />
                    </li>
                  ))}
                </ul>
              )}

              <ul id={listId} role="listbox" aria-label="Wyniki" className="flex flex-col gap-2" hidden={items.length === 0}>
                {items.map((item, index) => (
                  <ResultRow
                    key={item.id}
                    id={optionId(item)}
                    selected={index === activeIndex}
                    disabled={isDisabled(item)}
                    onHover={() => setActive(index)}
                    onPick={() => activate(item)}
                    layoutId={appOfItem(item) ? originLayoutId(appOfItem(item) as AppId, "spotlight") : undefined}
                  >
                    {renderItem(item)}
                  </ResultRow>
                ))}
              </ul>

              {command.kind === "incomplete" && (
                <div className="glass spotlight-row cursor-default" data-depth="mid" data-testid="spotlight-hint">
                  <span className="spotlight-icon" data-tone="quiet" aria-hidden>
                    <Info className="size-[50%]" strokeWidth={2} />
                  </span>
                  <p className="text-body text-text-primary">{command.message}</p>
                </div>
              )}

              {unknown && (
                <div className="glass spotlight-card" data-depth="mid" data-testid="spotlight-unknown">
                  <p className="text-title font-medium text-text-primary">Tego polecenia jeszcze nie znam.</p>
                  <p className="mt-0.5 text-body text-white/82">Spróbuj na przykład:</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {FALLBACK_EXAMPLES.map((example) => (
                      <li key={example}>
                        <ExampleChip text={example} onPick={fill} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div role="status" aria-live="polite" className="contents">
                {run && <ProgressChips run={run} reduceMotion={reduceMotion} />}
                {run?.step === 2 && run.outcome && !run.outcome.ok && (
                  <p className="glass spotlight-card text-body text-text-primary" data-depth="mid" data-testid="spotlight-error">
                    {run.outcome.error}
                  </p>
                )}
                {run?.step === 2 && run.outcome?.ok && run.outcome.title && (
                  <motion.div initial={rise} animate={{ opacity: 1, y: 0 }} transition={transitionFor(reduceMotion, spring.default)}>
                    <OutcomeCard
                      tone={run.outcome.tone}
                      title={run.outcome.title}
                      detail={run.outcome.detail}
                      chips={run.outcome.chips}
                      undone={run.undone}
                      onUndo={run.outcome.undo ? undo : null}
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {ghost && (
        <motion.div
          key={ghost.key}
          aria-hidden
          className="spotlight-ghost glass flex max-w-[18rem] items-center gap-2 rounded-pill py-1.5 pr-3.5 pl-1.5 text-body whitespace-nowrap text-text-primary"
          data-depth="near"
          style={{ left: ghost.from.x, top: ghost.from.y, translate: "-50% -50%" }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
          animate={{
            x: [0, (ghost.to.x - ghost.from.x) * 0.5, ghost.to.x - ghost.from.x],
            y: [0, (ghost.to.y - ghost.from.y) * 0.5 - 70, ghost.to.y - ghost.from.y],
            scale: [1, 0.85, 0.4],
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 0.7, ease: ease.out, times: [0, 0.45, 1] }}
          onAnimationComplete={() => {
            land(ghost.target, ghost.message);
            setGhost(null);
          }}
        >
          <span className="spotlight-icon size-8!">
            <ghost.icon aria-hidden className="size-4" strokeWidth={2} />
          </span>
          <span className="truncate">{ghost.label}</span>
        </motion.div>
      )}
    </>
  );

  function renderItem(item: Item): ReactNode {
    if (item.type === "app") {
      const Icon = APP_ICONS[item.app];
      return (
        <RowText icon={Icon} quiet primary={APPS[item.app].title} secondary="aplikacja" selected={item === activeItem} />
      );
    }
    const c = item.command;
    switch (c.kind) {
      case "price":
        return (
          <>
            <PriceCard symbol={c.symbol} now={now} />
            <EnterBadge visible={item === activeItem} label="Rynki" />
          </>
        );
      case "weather": {
        const day = dayOf(c.date);
        if (!day) return <RowText icon={CloudSun} quiet primary="Prognoza sięga 7 dni" secondary={dayLabel(c.date, today)} selected={false} />;
        if (!c.pin) {
          return (
            <>
              <WeatherCard day={day} label={dayLabel(c.date, today)} />
              <EnterBadge visible={item === activeItem} label="Na pulpit" />
            </>
          );
        }
        return <RowText icon={CloudSun} primary="Pokaż na pulpicie" secondary={dayLabel(c.date, today).toLocaleLowerCase("pl")} selected={item === activeItem} />;
      }
      case "reminder":
        return <RowText icon={Bell} primary="Utwórz przypomnienie" secondary={`${formatCommandWhen(c.at, now, timeZone)} · ${c.title}`} selected={item === activeItem} />;
      case "addItems":
        return <RowText icon={ListPlus} primary="Dodaj do listy" secondary={c.items.join(", ")} selected={item === activeItem} />;
      case "removeItem": {
        const found = findItem(useShoppingStore.getState().items, c.item);
        return <RowText icon={ListX} primary="Usuń z listy" secondary={found ? found.name : `${c.item} – nie ma na liście`} selected={item === activeItem && found !== null} />;
      }
      case "alert":
        return (
          <RowText
            icon={BellRing}
            primary="Ustaw alert"
            secondary={`${c.symbol} ${c.condition === "above" ? "powyżej" : "poniżej"} ${formatPrice(c.threshold, alertCurrency(c.currency))}`}
            selected={item === activeItem}
          />
        );
      case "openApp":
        return <RowText icon={APP_ICONS[c.app]} primary="Otwórz" secondary={APPS[c.app].title} selected={item === activeItem} />;
      default:
        return null;
    }
  }
}

/** Przesunięcie kuli z jej miejsca w układzie (bez parallaxu i przelotu) do miejsca w panelu. */
function measureFlight(
  anchor: HTMLElement | null,
  slot: HTMLElement | null,
  flight: OrbFlight,
  parallax: { x: MotionValue<number>; y: MotionValue<number> },
): { x: number; y: number; top: number; size: number } | null {
  if (!anchor || !slot) return null;
  const a = anchor.getBoundingClientRect();
  const s = slot.getBoundingClientRect();
  const left = a.left - flight.x.get() - parallax.x.get();
  const top = a.top - flight.y.get() - parallax.y.get();
  return { x: s.left - left, y: s.top - top, top, size: a.height };
}

function appOfItem(item: Item): AppId | null {
  if (item.type === "app") return item.app;
  if (item.command.kind === "openApp") return item.command.app;
  if (item.command.kind === "price") return "markets";
  return null;
}

function commandIcon(command: ActionCommand): LucideIcon {
  switch (command.kind) {
    case "reminder":
      return Bell;
    case "addItems":
      return ListPlus;
    case "removeItem":
      return ListX;
    case "alert":
      return BellRing;
    case "openApp":
      return APP_ICONS[command.app];
    case "weather":
      return CloudSun;
  }
}

interface ResultRowProps {
  id: string;
  selected: boolean;
  disabled: boolean;
  onHover: () => void;
  onPick: () => void;
  layoutId: string | undefined;
  children: ReactNode;
}

function ResultRow({ id, selected, disabled, onHover, onPick, layoutId, children }: ResultRowProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onPointerMove={onHover}
      onClick={onPick}
      data-testid="spotlight-result"
      className="glass spotlight-row relative"
      data-depth="mid"
    >
      {/* Kotwica przejścia współdzielonego: otwierana aplikacja rośnie z wiersza w okno. */}
      {layoutId && <motion.span aria-hidden layoutId={layoutId} className="pointer-events-none absolute inset-0 rounded-[inherit]" />}
      {children}
    </li>
  );
}

function RowText({ icon: Icon, primary, secondary, selected, quiet = false }: { icon: LucideIcon; primary: string; secondary: string; selected: boolean; quiet?: boolean }) {
  return (
    <>
      <span className="spotlight-icon" data-tone={quiet ? "quiet" : undefined} aria-hidden>
        <Icon className="size-[50%]" strokeWidth={2} />
      </span>
      {/* Na telefonie druga linia zamiast ucinania terminu i tytułu. */}
      <p className="min-w-0 flex-1 text-title text-text-primary sm:truncate">
        {primary}
        <span className="text-white/82 max-sm:block max-sm:truncate max-sm:text-body">
          <span className="max-sm:hidden"> · </span>
          <span className="sr-only sm:hidden">, </span>
          {secondary}
        </span>
      </p>
      <EnterBadge visible={selected} />
    </>
  );
}

function EnterBadge({ visible, label = "Enter" }: { visible: boolean; label?: string }) {
  if (!visible) return null;
  return (
    <span aria-hidden className="spotlight-enter text-body font-medium max-lg:hidden">
      {label === "Enter" ? "Enter" : `Enter · ${label}`}
    </span>
  );
}

function ExampleChip({ text, onPick }: { text: string; onPick: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      data-testid="spotlight-example"
      className="glass spotlight-chip text-body text-text-primary transition-colors duration-(--dur-feedback) hover:[--glass-milk:rgb(255_255_255/0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      data-depth="far"
    >
      {text}
    </button>
  );
}

function ProgressChips({ run, reduceMotion }: { run: Run; reduceMotion: boolean }) {
  const chips: { key: string; label: string; done: boolean }[] = [{ key: "understood", label: "Rozumiem polecenie", done: true }];
  if (run.step >= 1) chips.push({ key: "working", label: progressLabel(run.command), done: run.step === 2 });
  if (run.step === 2 && run.outcome?.ok) chips.push({ key: "done", label: "Gotowe", done: true });
  return (
    <ul className="spotlight-chips" data-testid="spotlight-progress" aria-label="Postęp">
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <motion.li
            key={chip.key}
            layout={!reduceMotion}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={transitionFor(reduceMotion, spring.snappy)}
            className="glass spotlight-chip text-body text-text-primary"
            data-depth="far"
            data-step={chip.key}
          >
            {chip.done ? (
              <>
                {chip.key === "working" ? chip.label.replace("…", "") : chip.label}
                <Check aria-hidden className="size-4" strokeWidth={2.25} />
              </>
            ) : (
              <>
                {chip.label}
                <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" strokeWidth={2} />
              </>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
