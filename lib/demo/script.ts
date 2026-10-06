import type { DayPeriod } from "@/lib/day-period";
import type { WeatherState } from "@/lib/scenes";
import type { AppId } from "@/lib/windows/apps";

/**
 * Scenariusz trybu demo jako dane: pętla ok. 75 s. Silnik (`use-demo.ts`) liczy
 * z niego klatkę dla bieżącej chwili (`demoFrame`) i budzi się dopiero przy następnej zmianie
 * (`nextDemoChange`) – bez pętli rAF.
 */
export type DemoStep =
  | { at: number; kind: "scene"; weather: WeatherState; time: DayPeriod }
  /** Podgląd dnia w kuli: przesunięcie od dziś w prognozie (null = bez podglądu). */
  | { at: number; kind: "preview"; day: number | null }
  | { at: number; kind: "spotlight"; open: boolean }
  /** Wpisywanie komendy znak po znaku. */
  | { at: number; kind: "type"; text: string; charMs: number }
  /** Enter w Spotlighcie (komenda wykonuje się na danych demo w pamięci). */
  | { at: number; kind: "submit" }
  | { at: number; kind: "window"; app: AppId | null };

export interface DemoFrame {
  /** Numer okrążenia (0, 1, …): nowe okrążenie zaczyna od świeżych danych demo. */
  loop: number;
  weather: WeatherState;
  time: DayPeriod;
  previewDay: number | null;
  spotlight: boolean;
  typed: string;
  submitted: boolean;
  window: AppId | null;
}

export const DEMO_LOOP_MS = 74_000;
export const DEMO_COMMAND = "przypomnij mi jutro o 9 o dentyście";
/** Piorun w burzy demo pada tyle po wejściu sceny (zwykle 6–15 s losowo). */
export const DEMO_FIRST_STRIKE_MS = 2200;

const TOUR: readonly DemoStep[] = [
  { at: 0, kind: "scene", weather: "sunny", time: "day" },
  { at: 7_000, kind: "scene", weather: "sunny", time: "golden" },
  { at: 14_000, kind: "scene", weather: "sunny", time: "night" },
  { at: 21_000, kind: "scene", weather: "rain", time: "day" },
  { at: 28_000, kind: "scene", weather: "storm", time: "day" },
  { at: 38_000, kind: "scene", weather: "sunny", time: "day" },
  { at: 39_500, kind: "preview", day: 1 },
  { at: 42_000, kind: "preview", day: 2 },
  { at: 44_500, kind: "preview", day: null },
  { at: 46_000, kind: "spotlight", open: true },
  { at: 47_200, kind: "type", text: DEMO_COMMAND, charMs: 55 },
  { at: 50_000, kind: "submit" },
  { at: 53_500, kind: "spotlight", open: false },
  { at: 55_000, kind: "window", app: "markets" },
  { at: 63_000, kind: "window", app: "news" },
  { at: 71_000, kind: "window", app: null },
];

/** Przy reduced motion sceny tylko się przenikają, a kula nie pokazuje podglądu dni. */
export function demoScript(reduceMotion: boolean): readonly DemoStep[] {
  return reduceMotion ? TOUR.filter((step) => step.kind !== "preview") : TOUR;
}

const INITIAL: Omit<DemoFrame, "loop"> = {
  weather: "sunny",
  time: "day",
  previewDay: null,
  spotlight: false,
  typed: "",
  submitted: false,
  window: null,
};

/** Stan wycieczki w chwili `elapsed` (ms od startu, z pętlą). */
export function demoFrame(steps: readonly DemoStep[], elapsed: number, loopMs = DEMO_LOOP_MS): DemoFrame {
  const loop = Math.floor(Math.max(0, elapsed) / loopMs);
  const t = Math.max(0, elapsed) - loop * loopMs;
  const frame: DemoFrame = { loop, ...INITIAL };
  for (const step of steps) {
    if (step.at > t) break;
    switch (step.kind) {
      case "scene":
        frame.weather = step.weather;
        frame.time = step.time;
        break;
      case "preview":
        frame.previewDay = step.day;
        break;
      case "spotlight":
        frame.spotlight = step.open;
        // Zamknięty Spotlight zaczyna od pustego pola.
        if (!step.open) {
          frame.typed = "";
          frame.submitted = false;
        }
        break;
      case "type": {
        const chars = Math.min(step.text.length, Math.floor((t - step.at) / step.charMs) + 1);
        frame.typed = step.text.slice(0, chars);
        break;
      }
      case "submit":
        frame.submitted = true;
        break;
      case "window":
        frame.window = step.app;
        break;
    }
  }
  return frame;
}

/** Najbliższa chwila (ms od startu), w której klatka może się zmienić. */
export function nextDemoChange(steps: readonly DemoStep[], elapsed: number, loopMs = DEMO_LOOP_MS): number {
  const loop = Math.floor(Math.max(0, elapsed) / loopMs);
  const base = loop * loopMs;
  const t = Math.max(0, elapsed) - base;
  let next = loopMs;
  for (const step of steps) {
    if (step.kind === "type") {
      const end = step.at + (step.text.length - 1) * step.charMs;
      if (t >= step.at && t < end) next = Math.min(next, step.at + (Math.floor((t - step.at) / step.charMs) + 1) * step.charMs);
    }
    if (step.at > t) next = Math.min(next, step.at);
  }
  return base + next;
}
