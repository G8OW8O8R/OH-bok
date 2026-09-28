import type { SceneVideoId } from "@/lib/scenes";

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
