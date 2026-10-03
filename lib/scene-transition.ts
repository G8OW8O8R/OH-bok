import type { DayPeriod } from "@/lib/day-period";
import { duration } from "@/lib/motion";
import type { SceneVideoId, WeatherState } from "@/lib/scenes";

/**
 * Stos warstw wideo sceny. Nigdy więcej niż dwie: widoczna scena (dół)
 * i scena wchodząca (góra). Dzięki temu w danej chwili ładuje się
 * co najwyżej jedno nowe nagranie.
 */
export interface SceneLayer {
  id: number;
  video: SceneVideoId;
  /** Warstwa ma pierwszą klatkę (poster albo wideo) i może się pojawić. */
  ready: boolean;
}

export type SceneLayers = readonly [SceneLayer] | readonly [SceneLayer, SceneLayer];

export function initialLayers(video: SceneVideoId): SceneLayers {
  return [{ id: 0, video, ready: true }];
}

/**
 * Dopasowuje stos do docelowej sceny. Zwraca tę samą referencję, gdy nic
 * się nie zmienia (bezpieczne do wywołania w trakcie renderu).
 *
 * - Brak przejścia: nowa scena trafia na górę jako niegotowa.
 * - Warstwa wchodząca jeszcze się nie pokazała: można ją podmienić bez
 *   widocznego skoku albo usunąć, gdy wracamy do sceny bazowej.
 * - Przenikanie trwa: czekamy na jego koniec (`settleLayers`), potem
 *   kolejne wywołanie rozpocznie przejście do najnowszego celu.
 */
export function reconcileLayers(layers: SceneLayers, target: SceneVideoId): SceneLayers {
  if (layers.length === 1) {
    const [only] = layers;
    if (only.video === target) return layers;
    return [only, { id: only.id + 1, video: target, ready: false }];
  }

  const [base, incoming] = layers;
  if (incoming.ready || incoming.video === target) return layers;
  if (base.video === target) return [base];
  return [base, { id: incoming.id + 1, video: target, ready: false }];
}

/** Oznacza warstwę wchodzącą jako gotową: od tej chwili zaczyna się przenikanie. */
export function markLayerReady(layers: SceneLayers, id: number): SceneLayers {
  if (layers.length === 1) return layers;
  const [base, incoming] = layers;
  if (incoming.id !== id || incoming.ready) return layers;
  return [base, { ...incoming, ready: true }];
}

/** Po zakończonym przenikaniu zostaje tylko warstwa wchodząca. */
export function settleLayers(layers: SceneLayers, id: number): SceneLayers {
  if (layers.length === 1) return layers;
  const [, incoming] = layers;
  if (incoming.id !== id || !incoming.ready) return layers;
  return [incoming];
}

/** Co wyznacza scenę: pogoda, pora, przypięty dzień prognozy i override `?time=`. */
export interface SceneKey {
  state: WeatherState;
  period: DayPeriod;
  /** Data przypiętego dnia (podróż w czasie) albo null = dziś. */
  pinned: string | null;
  timeOverride: DayPeriod | null;
}

/**
 * Tempo przejścia: „period” (ok. 15 s), gdy zmieniła się tylko pora dnia z zegara,
 * „scene” (1,4 s) przy każdej innej zmianie: pogoda, przypięty dzień, override.
 */
export type ScenePace = "scene" | "period";

export function sameSceneKey(a: SceneKey, b: SceneKey): boolean {
  return a.state === b.state && a.period === b.period && a.pinned === b.pinned && a.timeOverride === b.timeOverride;
}

export function scenePace(previous: SceneKey, next: SceneKey): ScenePace {
  const onlyClock =
    previous.period !== next.period &&
    previous.state === next.state &&
    previous.pinned === next.pinned &&
    previous.timeOverride === next.timeOverride;
  return onlyClock ? "period" : "scene";
}

/** Czas przenikania sceny w sekundach; reduced motion zawsze ≤ 150 ms. */
export function sceneDuration(pace: ScenePace, reduceMotion: boolean): number {
  if (reduceMotion) return duration.reducedFade;
  return pace === "period" ? duration.periodCrossfade : duration.sceneCrossfade;
}
