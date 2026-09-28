import { describe, expect, it } from "vitest";
import {
  initialLayers,
  markLayerReady,
  reconcileLayers,
  settleLayers,
  type SceneLayers,
} from "@/lib/scene-transition";

describe("scene-transition", () => {
  it("ta sama scena nie zmienia stosu (ta sama referencja)", () => {
    const layers = initialLayers("rain");
    expect(reconcileLayers(layers, "rain")).toBe(layers);
  });

  it("pełny cykl: nowa warstwa → gotowa → po przenikaniu zostaje sama", () => {
    let layers: SceneLayers = initialLayers("rain");
    layers = reconcileLayers(layers, "sunny");
    expect(layers).toEqual([
      { id: 0, video: "rain", ready: true },
      { id: 1, video: "sunny", ready: false },
    ]);

    layers = markLayerReady(layers, 1);
    expect(layers[1]?.ready).toBe(true);

    layers = settleLayers(layers, 1);
    expect(layers).toEqual([{ id: 1, video: "sunny", ready: true }]);
  });

  it("niegotową warstwę wchodzącą można podmienić bez skoku", () => {
    const pending = reconcileLayers(initialLayers("rain"), "sunny");
    expect(reconcileLayers(pending, "cloudy")).toEqual([
      { id: 0, video: "rain", ready: true },
      { id: 2, video: "cloudy", ready: false },
    ]);
  });

  it("powrót do sceny bazowej przed startem przenikania usuwa warstwę wchodzącą", () => {
    const pending = reconcileLayers(initialLayers("rain"), "sunny");
    expect(reconcileLayers(pending, "rain")).toEqual([{ id: 0, video: "rain", ready: true }]);
  });

  it("w trakcie przenikania nowy cel czeka; po zakończeniu rusza kolejne przejście", () => {
    const fading = markLayerReady(reconcileLayers(initialLayers("rain"), "sunny"), 1);
    expect(reconcileLayers(fading, "cloudy")).toBe(fading);

    const settled = settleLayers(fading, 1);
    expect(reconcileLayers(settled, "cloudy")).toEqual([
      { id: 1, video: "sunny", ready: true },
      { id: 2, video: "cloudy", ready: false },
    ]);
  });

  it("nigdy nie trzyma więcej niż dwóch warstw", () => {
    let layers: SceneLayers = initialLayers("rain");
    for (const target of ["sunny", "cloudy", "rain", "sunny", "cloudy"] as const) {
      layers = reconcileLayers(layers, target);
      expect(layers.length).toBeLessThanOrEqual(2);
    }
  });

  it("przestarzałe zdarzenia (inne id) są ignorowane", () => {
    const pending = reconcileLayers(initialLayers("rain"), "sunny");
    expect(markLayerReady(pending, 0)).toBe(pending);
    expect(settleLayers(pending, 1)).toBe(pending); // jeszcze niegotowa
    const single = initialLayers("rain");
    expect(markLayerReady(single, 0)).toBe(single);
    expect(settleLayers(single, 0)).toBe(single);
  });
});
