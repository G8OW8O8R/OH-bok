import { afterEach, describe, expect, it, vi } from "vitest";
import { isBootDone, markBootDone, onBootDone, resetBootForTests } from "@/lib/boot";
import { chooseOrbMode } from "@/lib/orb/capability";
import { FpsWatchdog } from "@/lib/orb/fps-watchdog";
import {
  backingSize,
  breathScale,
  canvasSize,
  layoutOrigin,
  orbCircles,
  orbDiameter,
  screenOrigin,
  screenToSceneUv,
} from "@/lib/orb/geometry";
import { previewAnnouncement, previewImage } from "@/lib/orb/preview";
import {
  approach,
  LISTEN_WAVES,
  orbTargets,
  parseOrbModeOverride,
  parseOrbStateOverride,
  speakPulse,
} from "@/lib/orb/states";
import { computeSceneFit } from "@/lib/scene-fit";
import {
  colorMatrix,
  flashBrightness,
  GOLDEN_ORB_TINT,
  gradePixel,
  orbTint,
  saturateMatrix,
  sceneFilterCss,
  tintCss,
} from "@/lib/scene-grading";
import { weekdayLong } from "@/lib/time";

describe("grading sceny", () => {
  it("saturate(1) to macierz jednostkowa, saturate(0) to luminancja ze specyfikacji", () => {
    const identity = saturateMatrix(1);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(identity[i]).toBeCloseTo(v, 10));
    // Kolumnowo: pierwsza kolumna to wkład R do R', G', B'.
    expect(saturateMatrix(0)).toEqual([0.213, 0.213, 0.213, 0.715, 0.715, 0.715, 0.072, 0.072, 0.072]);
  });

  it("piksel przechodzi brightness, potem saturate, z przycięciem jak w filtrach CSS", () => {
    const [r, g, b] = gradePixel([0.8, 0.4, 0.2], 0.72, 0.9);
    // Ręcznie: brightness → (0.576, 0.288, 0.144), potem wiersze macierzy saturate(0.9).
    expect(r).toBeCloseTo(0.9213 * 0.576 + 0.0715 * 0.288 + 0.0072 * 0.144, 6);
    expect(g).toBeCloseTo(0.0213 * 0.576 + 0.9715 * 0.288 + 0.0072 * 0.144, 6);
    expect(b).toBeCloseTo(0.0213 * 0.576 + 0.0715 * 0.288 + 0.9072 * 0.144, 6);
    // Rozjaśnienie ponad biel jest przycinane przed saturacją.
    expect(gradePixel([0.9, 0.9, 0.9], 1.35, 1)).toEqual([1, 1, 1]);
  });

  it("macierz koloru = saturate · diag(barwa); neutralna barwa nic nie zmienia", () => {
    expect(colorMatrix(0.9)).toEqual(saturateMatrix(0.9));
    const m = colorMatrix(1, [0.5, 1, 2]);
    [0.5, 0, 0, 0, 1, 0, 0, 0, 2].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 10));
  });

  it("barwa działa jak warstwa multiply pod filtrem (tint → brightness → saturate)", () => {
    const tint = [0.86, 0.92, 1] as const;
    const pixel = [0.6, 0.5, 0.4] as const;
    const css = gradePixel([pixel[0] * tint[0], pixel[1] * tint[1], pixel[2] * tint[2]], 0.62, 0.8);
    const shader = gradePixel(pixel, 0.62, 0.8, tint);
    shader.forEach((v, i) => expect(v).toBeCloseTo(css[i] ?? 0, 10));
  });

  it("złota godzina w kuli: uśredniony tint w sile warmth", () => {
    expect(orbTint([1, 1, 1], 0)).toEqual([1, 1, 1]);
    orbTint([1, 1, 1], 1).forEach((v, i) => expect(v).toBeCloseTo(GOLDEN_ORB_TINT[i] ?? 0, 10));
    const half = orbTint([0.5, 1, 1], 0.5);
    expect(half[0]).toBeCloseTo(0.5 * (1 + ((GOLDEN_ORB_TINT[0] - 1) / 2)), 10);
    expect(tintCss([0.86, 0.92, 1])).toBe("rgb(219 235 255)");
    expect(tintCss([1.2, -1, 0.5])).toBe("rgb(255 0 128)");
  });

  it("błysk rozjaśnia do 1,35× i jest ograniczony do [0, 1]", () => {
    expect(flashBrightness(1, 0)).toBe(1);
    expect(flashBrightness(1, 1)).toBeCloseTo(1.35);
    expect(flashBrightness(0.72, 2)).toBeCloseTo(0.972);
    expect(sceneFilterCss({ brightness: 0.72, saturate: 0.9 }, 0)).toBe("brightness(0.72) saturate(0.9)");
  });
});

describe("geometria kuli", () => {
  it("pozycja z layoutu nie zależy od parallaxu ani przewinięcia w chwili pomiaru", () => {
    const origin = layoutOrigin({ left: 110, top: 190, width: 400, height: 400 }, { x: 0, y: 30 }, { x: 10, y: -10 });
    expect(origin).toEqual({ x: 100, y: 230 });
    // Później: przewinięcie o 50 px w dół i parallax w drugą stronę.
    expect(screenOrigin(origin, { x: 0, y: 50 }, { x: -16, y: 16 })).toEqual({ x: 84, y: 196 });
  });

  it("piksel ekranu trafia w te same współrzędne klatki co wideo (cover)", () => {
    for (const [w, h] of [
      [1920, 1080],
      [2560, 1080],
      [1024, 768],
    ] as const) {
      const fit = computeSceneFit(w, h, 1);
      const center = screenToSceneUv({ x: w / 2, y: h / 2 }, fit);
      expect(center.x).toBeCloseTo(0.5, 2);
      expect(center.y).toBeCloseTo(0.5, 2);
      // Lewy górny róg ekranu jest wewnątrz klatki (przycięcie, nie ramka).
      const corner = screenToSceneUv({ x: 0, y: 0 }, fit);
      expect(corner.x).toBeGreaterThanOrEqual(0);
      expect(corner.y).toBeGreaterThanOrEqual(0);
    }
    // 21:9: klatka przycięta z góry i dołu.
    const wide = computeSceneFit(2560, 1080, 1);
    expect(screenToSceneUv({ x: 0, y: 0 }, wide).y).toBeGreaterThan(0.05);
  });

  it("oddech: 1 w spoczynku, +1,5% w połowie okresu", () => {
    expect(breathScale(0)).toBeCloseTo(1, 10);
    expect(breathScale(3)).toBeCloseTo(1.015, 10);
    expect(breathScale(6)).toBeCloseTo(1, 10);
    expect(breathScale(0, 3)).toBeCloseTo(1.015, 10);
  });

  it("płótno mieści kulę z marginesem, a mała kula leży przy prawym dolnym brzegu", () => {
    const size = canvasSize(362);
    expect(orbDiameter(size)).toBeCloseTo(362);
    const { big, small } = orbCircles(size, { big: 1, small: 1 });
    expect(big.r).toBeCloseTo(181);
    expect(big.x).toBeCloseTo(size / 2);
    expect(small.x + small.r).toBeLessThanOrEqual(size);
    expect(small.y + small.r).toBeLessThanOrEqual(size);
    expect(small.x).toBeGreaterThan(big.x);
    const pulsed = orbCircles(size, { big: 1, small: 1 }, 0.08);
    expect(pulsed.small.r).toBeCloseTo(small.r * 1.08);
    expect(pulsed.big.r).toBe(big.r);
  });

  it("bufor płótna ograniczony do 2× gęstości", () => {
    expect(backingSize(400, 1)).toBe(400);
    expect(backingSize(400, 1.5)).toBe(600);
    expect(backingSize(400, 3)).toBe(800);
    expect(backingSize(400, 0)).toBe(400);
  });

  it("mały ekran: maks. 1,5× gęstości i 480 px bufora", () => {
    // iPhone 390×844 @3×: płótno kuli ~197 px CSS.
    expect(backingSize(197, 3, 390)).toBe(296);
    expect(backingSize(400, 3, 390)).toBe(480);
    expect(backingSize(197, 1, 390)).toBe(197);
    // Od 768 px szerokości zwykły limit 2×.
    expect(backingSize(197, 3, 768)).toBe(394);
  });
});

describe("stany kuli", () => {
  it("override z adresu", () => {
    expect(parseOrbStateOverride("Thinking")).toBe("thinking");
    expect(parseOrbStateOverride(["speaking"])).toBe("speaking");
    expect(parseOrbStateOverride("nope")).toBeNull();
    expect(parseOrbModeOverride("fallback")).toBe("fallback");
    expect(parseOrbModeOverride(undefined)).toBeNull();
  });

  it("cele efektów dla stanów", () => {
    expect(orbTargets("idle")).toEqual({ think: 0, speak: 0 });
    expect(orbTargets("thinking")).toEqual({ think: 1, speak: 0 });
    expect(orbTargets("speaking")).toEqual({ think: 0, speak: 1 });
    expect(orbTargets("listening")).toEqual({ think: LISTEN_WAVES, speak: 0 });
    expect(orbTargets("listening", true)).toEqual({ think: 0, speak: 0 });
  });

  it("dochodzenie do celu nie zależy od liczby klatek i kończy się dokładnie na celu", () => {
    let a = 0;
    for (let i = 0; i < 60; i += 1) a = approach(a, 1, 1 / 60, 0.2);
    let b = 0;
    for (let i = 0; i < 30; i += 1) b = approach(b, 1, 1 / 30, 0.2);
    expect(a).toBeCloseTo(b, 2);
    let c = 0;
    for (let i = 0; i < 600; i += 1) c = approach(c, 1, 1 / 60, 0.2);
    expect(c).toBe(1);
    expect(approach(0.3, 1, 0.016, 0)).toBe(1);
  });

  it("puls „mówi” przy reduced motion jest stały", () => {
    expect(speakPulse(0, false)).toBeCloseTo(0);
    expect(speakPulse(1 / 2.4, false)).toBeCloseTo(1);
    expect(speakPulse(0, true)).toBe(speakPulse(0.3, true));
  });
});

describe("wybór trybu", () => {
  it("override ma pierwszeństwo", () => {
    expect(chooseOrbMode("fallback", {})).toEqual({ mode: "fallback", reason: "forced" });
    expect(chooseOrbMode("webgl", { deviceMemory: 1, hardwareConcurrency: 2 })).toEqual({ mode: "webgl", forced: true });
  });

  it("słabe urządzenie dostaje kulę w CSS", () => {
    expect(chooseOrbMode(null, { deviceMemory: 4, hardwareConcurrency: 8 })).toEqual({ mode: "fallback", reason: "low-memory" });
    expect(chooseOrbMode(null, { deviceMemory: 8, hardwareConcurrency: 4 })).toEqual({ mode: "fallback", reason: "few-cores" });
  });

  it("brak wskazówek (Safari, Firefox) = WebGL", () => {
    expect(chooseOrbMode(null, {})).toEqual({ mode: "webgl", forced: false });
    expect(chooseOrbMode(null, { deviceMemory: 8, hardwareConcurrency: 12 })).toEqual({ mode: "webgl", forced: false });
  });
});

function run(watchdog: FpsWatchdog, from: number, fps: number, ms: number): number {
  const step = 1000 / fps;
  let t = from;
  for (; t < from + ms; t += step) watchdog.frame(t);
  return t;
}

describe("watchdog klatek", () => {
  it("dwa wolne okna z rzędu = fallback", () => {
    const watchdog = new FpsWatchdog();
    run(watchdog, 0, 40, 4200);
    expect(watchdog.result).toBe("slow");
  });

  it("jedno wolne okno (np. dekodowanie obrazu) niczego nie przełącza", () => {
    const watchdog = new FpsWatchdog();
    let t = run(watchdog, 0, 40, 2100);
    t = run(watchdog, t, 60, 2100);
    t = run(watchdog, t, 40, 2100);
    run(watchdog, t, 60, 5000);
    expect(watchdog.result).toBe("ok");
  });

  it("płynne klatki: po 5 oknach pomiar się kończy", () => {
    const watchdog = new FpsWatchdog();
    run(watchdog, 0, 60, 10_500);
    expect(watchdog.result).toBe("ok");
  });

  it("przerwa (ukryta karta) nie liczy się jako wolne klatki", () => {
    const watchdog = new FpsWatchdog();
    let t = run(watchdog, 0, 60, 1500);
    t += 5000;
    t = run(watchdog, t, 60, 1500);
    watchdog.pause();
    t = run(watchdog, t + 10_000, 60, 1000);
    expect(watchdog.result).toBe("measuring");
    run(watchdog, t, 60, 10_000);
    expect(watchdog.result).toBe("ok");
  });
});

describe("sygnał końca startu", () => {
  afterEach(() => resetBootForTests());

  it("słuchacze dostają sygnał raz, późni od razu", () => {
    const early = vi.fn();
    const unsubscribed = vi.fn();
    onBootDone(early);
    const off = onBootDone(unsubscribed);
    off();
    expect(isBootDone()).toBe(false);
    markBootDone();
    markBootDone();
    expect(early).toHaveBeenCalledTimes(1);
    expect(unsubscribed).not.toHaveBeenCalled();
    const late = vi.fn();
    onBootDone(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe("podgląd dnia", () => {
  it("tekst dla czytników ekranu", () => {
    expect(weekdayLong("2026-10-01")).toBe("Czwartek");
    expect(previewAnnouncement({ date: "2026-10-01", state: "sunny", temperatureMaxC: 17.6 }, "2026-09-30")).toBe(
      "Czwartek: słonecznie, 18°",
    );
    expect(previewAnnouncement({ date: "2026-09-30", state: "storm", temperatureMaxC: -0.4 }, "2026-09-30")).toBe(
      "Dziś: burza, 0°",
    );
    expect(previewAnnouncement({ date: "2026-10-02", state: "fog", temperatureMaxC: null }, "2026-09-30")).toBe(
      "Piątek: mgła, brak danych o temperaturze",
    );
  });

  it("obraz podglądu to poster sceny dnia z jej gradingiem", () => {
    expect(previewImage({ state: "storm" })).toEqual({
      video: "rain",
      poster: "/scenes/rain-lighthouse/poster.jpg",
      grading: { brightness: 0.72, saturate: 0.9 },
    });
    expect(previewImage({ state: "fog" }).video).toBe("cloudy");
  });
});
