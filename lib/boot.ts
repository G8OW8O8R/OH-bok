import { spring } from "@/lib/motion";

/**
 * Sekwencja startowa: harmonogram, bramka postępu
 * i stan startu wspólny dla komponentów.
 *
 * Plan startu wybiera skrypt inline w <head> (przed pierwszym malowaniem) i zapisuje go
 * w `html[data-boot]`; kroki pulpitu to animacje CSS (styles/boot.css) z czasami ze zmiennych
 * ustawionych przez ten sam skrypt. Komponent Boot pilnuje bramki postępu, przelotu kul
 * i końca startu (`markBootDone()`), po którym rusza parallax i watchdog kuli.
 */

/** Pierwsza wizyta, wybudzenie (kolejne wizyty), przenikanie (reduced motion), brak startu. */
export type BootPlan = "first" | "wake" | "reduced" | "off";

export const BOOT_STORAGE_KEY = "obok-boot";

/** Nazwy znaczników w Performance Timeline (pomiar timingów w e2e i w nagraniu). */
export const BOOT_MARK = {
  /** Skrypt inline wybrał plan (przed pierwszą klatką). */
  script: "obok-boot:script",
  /** Pierwsza klatka = „0 ms” tabeli: od niej liczą się animacje CSS logo. */
  start: "obok-boot:start",
  /** Boot zamontowany (hydracja): wcześniej bramka nie może ruszyć. */
  live: "obok-boot:live",
  reveal: "obok-boot:reveal",
  flight: "obok-boot:flight",
  landed: "obok-boot:landed",
  curve: "obok-boot:curve",
  done: "obok-boot:done",
  skip: "obok-boot:skip",
} as const;

/**
 * Pierwsza wizyta, ms od czarnego ekranu. Kroki od `reveal` w górę zaczynają się
 * po bramce postępu: gdy wszystko jest gotowe przed 1600 ms, stoją dokładnie tam, gdzie w tabeli,
 * inaczej przesuwają się o czas oczekiwania (maks. do `maxWait`).
 */
export const BOOT_FIRST = {
  logo: { at: 100, duration: 500 },
  /** Mała „o” wsuwa się sprężyną gentle; kończy ok. 900 ms. */
  logoSmall: { at: 300 },
  wordmark: { at: 700, duration: 400 },
  bar: { at: 1100, duration: 500 },
  /** Bramka: pasek pełny, scena może się wyłonić. */
  gate: 1600,
  /** Jeśli coś ładuje się dłużej, sekwencja i tak idzie dalej. */
  maxWait: 2500,
  /** Pasek dobity do końca po spóźnionym zasobie, zanim ruszy scena. */
  barSettle: 150,
  logoOut: { at: 1700, duration: 300 },
  /** Wyłanianie sceny i przelot kul do kuli „Obok”. */
  scene: { at: 1700, duration: 1200 },
  /** Kula docelowa przejmuje lecące kule. */
  handoff: 200,
  chrome: { at: 2300, duration: 600 },
  greeting: { at: 2400, duration: 600 },
  headline: { at: 2550, duration: 600 },
  /** Odsłanianie maską: kolejna linia tekstu rusza tyle później. */
  lineStep: 150,
  widgets: { at: 2700, duration: 700, step: 60 },
  curve: { at: 2900, duration: 1400, fillLag: 220 },
  days: { at: 2900, duration: 500, step: 70 },
  dock: { at: 3600, duration: 600 },
  /** Refleks rusza na panelu przy lewej krawędzi; na prawej `travel` ms później. */
  coda: { at: 3900, duration: 600, travel: 200 },
  /** Koniec ostatniego kroku (koda na ostatnim panelu). */
  end: 4700,
} as const;

/** Kolejne wizyty: „wybudzenie” ~800 ms (blur 20 → 0, skrócony stagger). */
export const BOOT_WAKE = {
  scene: { at: 0, duration: 800 },
  chrome: { at: 100, duration: 500 },
  greeting: { at: 150, duration: 450 },
  headline: { at: 200, duration: 450 },
  lineStep: 60,
  widgets: { at: 200, duration: 450, step: 30 },
  curve: { at: 200, duration: 600, fillLag: 120 },
  days: { at: 250, duration: 400, step: 30 },
  dock: { at: 300, duration: 500 },
  end: 850,
} as const;

/** Reduced motion: jedno przenikanie ≤ 150 ms, gdy poster jest gotowy (maks. po `maxWait`). */
export const BOOT_REDUCED = {
  fade: 150,
  maxWait: 2500,
} as const;

/** Bezpiecznik skryptu inline: bez hydracji (np. błąd JS) pulpit i tak się pokazuje. */
export const BOOT_SCRIPT_SAFETY_MS = 8000;

/** Sygnały realnego ładowania, które wypełniają pasek postępu. */
export type BootSignal = "poster" | "video" | "weather";
export const BOOT_SIGNALS: readonly BootSignal[] = ["poster", "video", "weather"];

/**
 * Wybór planu. Funkcja trafia do skryptu inline przez `toString()`, więc musi być
 * samowystarczalna (żadnych odwołań do stałych modułu).
 */
export function resolveBootPlan(input: { param: string | null; seen: boolean; reducedMotion: boolean }): BootPlan {
  if (input.param === "off") return "off";
  if (input.reducedMotion) return "reduced";
  if (input.param === "first" || input.param === "wake") return input.param;
  return input.seen ? "wake" : "first";
}

/**
 * Chwila (ms od startu) odsłonięcia sceny po bramce postępu.
 * `readyAt` = chwila, gdy wszystkie sygnały są gotowe (null = jeszcze nie są).
 */
export function revealAt(
  readyAt: number | null,
  gate: { gate: number; maxWait: number; settle: number } = {
    gate: BOOT_FIRST.gate,
    maxWait: BOOT_FIRST.maxWait,
    settle: BOOT_FIRST.barSettle,
  },
): number {
  if (readyAt === null) return gate.maxWait;
  if (readyAt <= gate.gate) return gate.gate;
  return Math.min(gate.maxWait, readyAt + gate.settle);
}

/** Wypełnienie paska (0–1): realny postęp, ale nie szybciej niż w tabeli (1100–1600 ms). */
export function barProgress(elapsed: number, ready: number, total: number): number {
  const { at, duration } = BOOT_FIRST.bar;
  const byTime = Math.min(1, Math.max(0, (elapsed - at) / duration));
  const real = total > 0 ? Math.min(1, ready / total) : 1;
  return Math.min(byTime, real);
}

type SpringConfig = { stiffness: number; damping: number; mass?: number };

/**
 * Sprężyna jako krzywa CSS `linear()` (animacje logo działają przed hydracją, w czystym CSS).
 * Symulacja krokiem 1 ms do ustania (±0,1%).
 */
export function springEasing(config: SpringConfig, points = 40): { easing: string; duration: number } {
  const mass = config.mass ?? 1;
  const dt = 0.001;
  let x = 0;
  let v = 0;
  const samples: number[] = [0];
  let t = 0;
  while (t < 5) {
    const a = (-config.stiffness * (x - 1) - config.damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    samples.push(x);
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const values: string[] = [];
  for (let i = 0; i <= points; i++) {
    const index = Math.round((i / points) * (samples.length - 1));
    const value = i === points ? 1 : (samples[index] ?? 1);
    values.push(String(Math.round(value * 1000) / 1000));
  }
  return { easing: `linear(${values.join(", ")})`, duration: Math.round(t * 1000) };
}

const ms = (value: number) => `${value}ms`;

/**
 * Zmienne CSS kroków (styles/boot.css). Pierwsza wizyta: logo liczone od czarnego ekranu,
 * reszta od bramki (animacje stoją wstrzymane do `data-boot-step="reveal"`). Wybudzenie: od startu.
 */
export function bootCssVars(plan: BootPlan): Record<string, string> {
  if (plan === "first") {
    const f = BOOT_FIRST;
    const fromGate = (at: number) => ms(at - f.gate);
    const small = springEasing(spring.gentle);
    return {
      "--boot-logo-delay": ms(f.logo.at),
      "--boot-logo-dur": ms(f.logo.duration),
      "--boot-small-delay": ms(f.logoSmall.at),
      "--boot-small-dur": ms(small.duration),
      "--boot-spring": small.easing,
      "--boot-wordmark-delay": ms(f.wordmark.at),
      "--boot-wordmark-dur": ms(f.wordmark.duration),
      "--boot-bar-delay": ms(f.bar.at),
      "--boot-out-delay": fromGate(f.logoOut.at),
      "--boot-out-dur": ms(f.logoOut.duration),
      "--boot-scene-delay": fromGate(f.scene.at),
      "--boot-scene-dur": ms(f.scene.duration),
      "--boot-chrome-delay": fromGate(f.chrome.at),
      "--boot-chrome-dur": ms(f.chrome.duration),
      "--boot-greeting-delay": fromGate(f.greeting.at),
      "--boot-greeting-dur": ms(f.greeting.duration),
      "--boot-headline-delay": fromGate(f.headline.at),
      "--boot-headline-dur": ms(f.headline.duration),
      "--boot-line-step": ms(f.lineStep),
      "--boot-widgets-delay": fromGate(f.widgets.at),
      "--boot-widgets-dur": ms(f.widgets.duration),
      "--boot-widgets-step": ms(f.widgets.step),
      "--boot-days-delay": fromGate(f.days.at),
      "--boot-days-dur": ms(f.days.duration),
      "--boot-days-step": ms(f.days.step),
      "--boot-dock-delay": fromGate(f.dock.at),
      "--boot-dock-dur": ms(f.dock.duration),
      "--boot-coda-delay": fromGate(f.coda.at),
      "--boot-coda-dur": ms(f.coda.duration),
      "--boot-coda-travel": ms(f.coda.travel),
    };
  }
  if (plan === "wake") {
    const w = BOOT_WAKE;
    return {
      "--boot-scene-delay": ms(w.scene.at),
      "--boot-scene-dur": ms(w.scene.duration),
      "--boot-chrome-delay": ms(w.chrome.at),
      "--boot-chrome-dur": ms(w.chrome.duration),
      "--boot-greeting-delay": ms(w.greeting.at),
      "--boot-greeting-dur": ms(w.greeting.duration),
      "--boot-headline-delay": ms(w.headline.at),
      "--boot-headline-dur": ms(w.headline.duration),
      "--boot-line-step": ms(w.lineStep),
      "--boot-widgets-delay": ms(w.widgets.at),
      "--boot-widgets-dur": ms(w.widgets.duration),
      "--boot-widgets-step": ms(w.widgets.step),
      "--boot-days-delay": ms(w.days.at),
      "--boot-days-dur": ms(w.days.duration),
      "--boot-days-step": ms(w.days.step),
      "--boot-dock-delay": ms(w.dock.at),
      "--boot-dock-dur": ms(w.dock.duration),
    };
  }
  return {};
}

/**
 * Skrypt inline do <head>: wybiera plan i ustawia go przed pierwszym malowaniem, więc pulpit
 * nie mignie przed sekwencją, a animacje CSS ruszają od pierwszej klatki (także przed hydracją).
 */
export function bootInlineScript(): string {
  const vars = { first: bootCssVars("first"), wake: bootCssVars("wake") };
  return [
    "(function(){try{",
    "var d=document.documentElement,s=null,q=null;",
    `try{s=localStorage.getItem(${JSON.stringify(BOOT_STORAGE_KEY)})}catch(e){}`,
    "try{q=new URLSearchParams(location.search).get('boot')}catch(e){}",
    `var p=(${resolveBootPlan.toString()})({param:q,seen:s!==null,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});`,
    "if(p==='off')return;",
    "d.setAttribute('data-boot',p);",
    `performance.mark(${JSON.stringify(BOOT_MARK.script)});`,
    `requestAnimationFrame(function(){performance.mark(${JSON.stringify(BOOT_MARK.start)})});`,
    `var v=${JSON.stringify(vars)}[p]||{};`,
    "for(var k in v)d.style.setProperty(k,v[k]);",
    "setTimeout(function(){if(!d.hasAttribute('data-boot-live')){d.removeAttribute('data-boot');d.removeAttribute('data-boot-step')}},",
    String(BOOT_SCRIPT_SAFETY_MS),
    ");",
    "}catch(e){}})();",
  ].join("");
}

/** Plan zapisany przez skrypt inline (brak atrybutu = bez sekwencji). */
export function parseBootPlan(value: string | undefined): BootPlan {
  return value === "first" || value === "wake" || value === "reduced" ? value : "off";
}

// ---------------------------------------------------------------------------
// Stan startu (wspólny dla Boot, krzywej temperatury, parallaxu i kuli)

export type BootPhase = "hold" | "reveal" | "done";

export interface BootState {
  /** null = Boot jeszcze nie ruszył (SSR i pierwszy render). */
  plan: BootPlan | null;
  phase: BootPhase;
  /** Start sekwencji (performance.now()). */
  startedAt: number;
  /** Chwila odsłonięcia sceny (performance.now()); null przed bramką. */
  revealedAt: number | null;
  /** Start pominięty klawiszem albo kliknięciem. */
  skipped: boolean;
}

type Listener = () => void;

const INITIAL: BootState = { plan: null, phase: "hold", startedAt: 0, revealedAt: null, skipped: false };

let state: BootState = INITIAL;
const stateListeners = new Set<Listener>();
const signals = new Map<BootSignal, number>();
const signalListeners = new Set<Listener>();

export function getBootState(): BootState {
  return state;
}

export function getServerBootState(): BootState {
  return INITIAL;
}

export function setBootState(patch: Partial<BootState>): void {
  state = { ...state, ...patch };
  for (const listener of stateListeners) listener();
}

export function subscribeBoot(listener: Listener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Zasób gotowy (pierwszy raz liczy się czas zgłoszenia). */
export function reportBootSignal(signal: BootSignal, at = performance.now()): void {
  if (signals.has(signal)) return;
  signals.set(signal, at);
  for (const listener of signalListeners) listener();
}

export function bootSignals(): ReadonlyMap<BootSignal, number> {
  return signals;
}

export function onBootSignal(listener: Listener): () => void {
  signalListeners.add(listener);
  return () => {
    signalListeners.delete(listener);
  };
}

/**
 * Chwila, w której gotowe są wszystkie wymagane sygnały (najpóźniejszy), albo null.
 */
export function readyTime(times: ReadonlyMap<BootSignal, number>, required: readonly BootSignal[]): number | null {
  let latest = -Infinity;
  for (const signal of required) {
    const at = times.get(signal);
    if (at === undefined) return null;
    latest = Math.max(latest, at);
  }
  return required.length ? latest : 0;
}

// ---------------------------------------------------------------------------
// Sygnał końca startu: do tej chwili strona się ładuje i dekoduje, więc pomiary
// płynności (watchdog kuli) nie mają sensu, a parallax mógłby przesunąć cel przelotu kul.

let done = false;
const doneListeners = new Set<Listener>();

export function isBootDone(): boolean {
  return done;
}

export function markBootDone(): void {
  if (done) return;
  done = true;
  for (const listener of doneListeners) listener();
  doneListeners.clear();
}

/** Wywołuje `listener` po zakończeniu startu (od razu, jeśli już się skończył). Zwraca wypisanie. */
export function onBootDone(listener: Listener): () => void {
  if (done) {
    listener();
    return () => {};
  }
  doneListeners.add(listener);
  return () => {
    doneListeners.delete(listener);
  };
}

/** Tylko do testów jednostkowych. */
export function resetBootForTests(): void {
  done = false;
  doneListeners.clear();
  state = INITIAL;
  stateListeners.clear();
  signals.clear();
  signalListeners.clear();
}

/** Rysowanie krzywej temperatury w rytmie startu (czasy w ms, `startAt` w zegarze performance.now()). */
export type CurveTiming =
  | { kind: "wait" }
  | { kind: "instant" }
  | { kind: "draw"; startAt: number; duration: number; fillLag: number };

export function curveTiming(boot: BootState): CurveTiming {
  if (boot.plan === null) return { kind: "wait" };
  if (boot.phase === "done" || boot.plan === "off" || boot.plan === "reduced") return { kind: "instant" };
  if (boot.plan === "wake") {
    const { at, duration, fillLag } = BOOT_WAKE.curve;
    return { kind: "draw", startAt: boot.startedAt + at, duration, fillLag };
  }
  if (boot.revealedAt === null) return { kind: "wait" };
  const { at, duration, fillLag } = BOOT_FIRST.curve;
  return { kind: "draw", startAt: boot.revealedAt + at - BOOT_FIRST.gate, duration, fillLag };
}
