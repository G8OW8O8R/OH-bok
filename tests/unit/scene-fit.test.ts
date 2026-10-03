import { describe, expect, it } from "vitest";
import { computeSceneFit, SCENE_ASPECT, SCENE_FOCUS, sceneFitCssVars, sceneFitInlineScript } from "@/lib/scene-fit";

const VIEWPORTS = [
  [1280, 720, 1],
  [1920, 1080, 1],
  [1536, 864, 1.25],
  [1366, 768, 1],
  [1440, 900, 2],
  [390, 844, 3],
  [800, 800, 1.5],
  [2560, 1080, 1],
  [1001, 577, 1.75],
] as const;

describe("computeSceneFit", () => {
  it.each(VIEWPORTS)("%ix%i @%sx pokrywa całe okno", (w, h, dpr) => {
    const fit = computeSceneFit(w, h, dpr);
    expect(fit.left).toBeLessThanOrEqual(0);
    expect(fit.top).toBeLessThanOrEqual(0);
    expect(fit.left + fit.width).toBeGreaterThanOrEqual(w - 1e-9);
    expect(fit.top + fit.height).toBeGreaterThanOrEqual(h - 1e-9);
  });

  it.each(VIEWPORTS)("%ix%i @%sx wyrównuje pudełko do pikseli fizycznych", (w, h, dpr) => {
    const fit = computeSceneFit(w, h, dpr);
    for (const value of [fit.width, fit.height, fit.left, fit.top]) {
      const devicePx = value * dpr;
      expect(Math.abs(devicePx - Math.round(devicePx))).toBeLessThan(1e-6);
    }
  });

  it.each(VIEWPORTS)("%ix%i @%sx zachowuje proporcje 16:9 (błąd < 1 px fizyczny)", (w, h, dpr) => {
    const fit = computeSceneFit(w, h, dpr);
    const expectedHeight = fit.width / SCENE_ASPECT;
    expect(Math.abs(fit.height - expectedHeight) * dpr).toBeLessThan(1);
  });

  it("okno 16:9 w natywnym rozmiarze = obraz 1:1 bez przesunięcia", () => {
    expect(computeSceneFit(1280, 720, 1)).toEqual({ width: 1280, height: 720, left: 0, top: 0 });
  });

  it("okno poziome węższe niż 16:9 (16:10, 4:3) przycina boki symetrycznie", () => {
    for (const [w, h] of [[1440, 900], [1600, 1200]] as const) {
      const fit = computeSceneFit(w, h, 1);
      expect(fit.height).toBe(h);
      expect(Math.abs(fit.left * 2 + fit.width - w)).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    [390, 844],
    [768, 1024],
    [800, 800],
  ] as const)("okno pionowe/kwadratowe %ix%i: latarnia (77,7% kadru) na 86% szerokości ekranu", (w, h) => {
    const fit = computeSceneFit(w, h, 1);
    const lighthouseX = fit.left + fit.width * SCENE_FOCUS.anchorX;
    expect(lighthouseX / w).toBeCloseTo(SCENE_FOCUS.anchorViewX, 2);
  });

  it("nieprawidłowe devicePixelRatio traktuje jak 1", () => {
    expect(computeSceneFit(1280, 720, 0)).toEqual(computeSceneFit(1280, 720, 1));
  });
});

describe("sceneFitInlineScript", () => {
  function runScript(width: number, height: number, dpr: number): string {
    let css = "";
    const style = { id: "", textContent: "" };
    const fakeDocument = {
      documentElement: { clientWidth: width, clientHeight: height },
      createElement: () => style,
      head: { appendChild: () => (css = style.textContent) },
    };
    new Function("document", "window", sceneFitInlineScript())(fakeDocument, { devicePixelRatio: dpr });
    return css;
  }

  it.each(VIEWPORTS)("%ix%i @%sx liczy to samo co computeSceneFit", (w, h, dpr) => {
    const vars = sceneFitCssVars(computeSceneFit(w, h, dpr));
    const expected = `:root{${Object.entries(vars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}`;
    expect(runScript(w, h, dpr)).toBe(expected);
  });
});
