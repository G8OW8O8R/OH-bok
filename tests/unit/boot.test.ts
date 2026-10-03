import { afterEach, describe, expect, it } from "vitest";
import {
  barProgress,
  BOOT_FIRST,
  BOOT_WAKE,
  bootCssVars,
  bootInlineScript,
  curveTiming,
  readyTime,
  resetBootForTests,
  resolveBootPlan,
  revealAt,
  springEasing,
  type BootSignal,
  type BootState,
} from "@/lib/boot";
import { spring } from "@/lib/motion";

describe("plan startu", () => {
  it("pierwsza wizyta, wybudzenie, reduced motion i override", () => {
    expect(resolveBootPlan({ param: null, seen: false, reducedMotion: false })).toBe("first");
    expect(resolveBootPlan({ param: null, seen: true, reducedMotion: false })).toBe("wake");
    expect(resolveBootPlan({ param: null, seen: false, reducedMotion: true })).toBe("reduced");
    expect(resolveBootPlan({ param: "first", seen: true, reducedMotion: false })).toBe("first");
    expect(resolveBootPlan({ param: "wake", seen: false, reducedMotion: false })).toBe("wake");
    // Reduced motion wygrywa z wymuszonym planem; „off” wyłącza wszystko.
    expect(resolveBootPlan({ param: "first", seen: false, reducedMotion: true })).toBe("reduced");
    expect(resolveBootPlan({ param: "off", seen: false, reducedMotion: true })).toBe("off");
    expect(resolveBootPlan({ param: "bzdura", seen: false, reducedMotion: false })).toBe("first");
  });

  it("skrypt inline jest samowystarczalny i zawiera czasy obu planów", () => {
    const script = bootInlineScript();
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('"--boot-chrome-delay":"700ms"');
    expect(script).toContain('"--boot-chrome-delay":"100ms"');
  });
});

describe("bramka postępu", () => {
  it("wszystko gotowe przed 1600 ms: scena rusza dokładnie według tabeli", () => {
    expect(revealAt(300)).toBe(1600);
    expect(revealAt(1600)).toBe(1600);
  });

  it("spóźniony zasób przesuwa sekwencję, ale najwyżej do 2,5 s", () => {
    expect(revealAt(2000)).toBe(2000 + BOOT_FIRST.barSettle);
    expect(revealAt(2450)).toBe(2500);
    expect(revealAt(null)).toBe(2500);
  });

  it("gotowość = najpóźniejszy z wymaganych sygnałów", () => {
    const times = new Map<BootSignal, number>([
      ["poster", 400],
      ["weather", 200],
    ]);
    expect(readyTime(times, ["poster", "video", "weather"])).toBeNull();
    times.set("video", 1300);
    expect(readyTime(times, ["poster", "video", "weather"])).toBe(1300);
    expect(readyTime(times, ["poster"])).toBe(400);
  });

  it("pasek: realny postęp, nie szybciej niż 1100–1600 ms", () => {
    expect(barProgress(1000, 3, 3)).toBe(0);
    expect(barProgress(1350, 3, 3)).toBeCloseTo(0.5);
    expect(barProgress(1350, 1, 3)).toBeCloseTo(1 / 3);
    expect(barProgress(1600, 2, 3)).toBeCloseTo(2 / 3);
    expect(barProgress(1700, 3, 3)).toBe(1);
  });
});

describe("harmonogram", () => {
  it("kroki pierwszej wizyty zgadzają się z harmonogramem", () => {
    const vars = bootCssVars("first");
    const fromTable = (at: number) => `${at - BOOT_FIRST.gate}ms`;
    expect(vars["--boot-logo-delay"]).toBe("100ms");
    expect(vars["--boot-wordmark-delay"]).toBe("700ms");
    expect(vars["--boot-bar-delay"]).toBe("1100ms");
    expect(vars["--boot-scene-delay"]).toBe(fromTable(1700));
    expect(vars["--boot-chrome-delay"]).toBe(fromTable(2300));
    expect(vars["--boot-greeting-delay"]).toBe(fromTable(2400));
    expect(vars["--boot-headline-delay"]).toBe(fromTable(2550));
    expect(vars["--boot-widgets-delay"]).toBe(fromTable(2700));
    expect(vars["--boot-widgets-step"]).toBe("60ms");
    expect(vars["--boot-days-delay"]).toBe(fromTable(2900));
    expect(vars["--boot-days-step"]).toBe("70ms");
    expect(vars["--boot-dock-delay"]).toBe(fromTable(3600));
    expect(vars["--boot-coda-delay"]).toBe(fromTable(3900));
    expect(BOOT_FIRST.scene.at + BOOT_FIRST.scene.duration).toBe(2900);
    expect(BOOT_FIRST.curve.at + BOOT_FIRST.curve.duration).toBe(4300);
    expect(BOOT_FIRST.curve.fillLag).toBe(220);
    expect(BOOT_FIRST.end).toBe(BOOT_FIRST.coda.at + BOOT_FIRST.coda.travel + BOOT_FIRST.coda.duration);
  });

  it("mała „o” kończy wsuwanie ok. 900 ms", () => {
    const small = BOOT_FIRST.logoSmall.at + springEasing(spring.gentle).duration;
    expect(Math.abs(small - 900)).toBeLessThanOrEqual(50);
  });

  it("wybudzenie mieści się w ~800 ms", () => {
    const ends = [
      BOOT_WAKE.scene.at + BOOT_WAKE.scene.duration,
      BOOT_WAKE.curve.at + BOOT_WAKE.curve.duration,
      BOOT_WAKE.dock.at + BOOT_WAKE.dock.duration,
      BOOT_WAKE.widgets.at + BOOT_WAKE.widgets.step * 4 + BOOT_WAKE.widgets.duration,
    ];
    for (const end of ends) expect(end).toBeLessThanOrEqual(BOOT_WAKE.end);
    expect(BOOT_WAKE.end).toBeLessThanOrEqual(900);
  });

  it("sprężyna jako linear(): od 0 do 1, z lekkim przestrzeleniem", () => {
    const { easing } = springEasing(spring.gentle);
    const values = easing.slice("linear(".length, -1).split(", ").map(Number);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(Math.max(...values)).toBeGreaterThan(1);
  });
});

describe("krzywa temperatury w rytmie startu", () => {
  afterEach(() => resetBootForTests());
  const base: BootState = { plan: "first", phase: "hold", startedAt: 100, revealedAt: null, skipped: false };

  it("czeka na bramkę, potem rysuje 2900–4300 ms", () => {
    expect(curveTiming({ ...base, plan: null }).kind).toBe("wait");
    expect(curveTiming(base).kind).toBe("wait");
    expect(curveTiming({ ...base, phase: "reveal", revealedAt: 1700 })).toEqual({
      kind: "draw",
      startAt: 1700 + 1300,
      duration: 1400,
      fillLag: 220,
    });
  });

  it("po starcie, po pominięciu i przy reduced motion: od razu narysowana", () => {
    expect(curveTiming({ ...base, phase: "done", skipped: true }).kind).toBe("instant");
    expect(curveTiming({ ...base, plan: "reduced" }).kind).toBe("instant");
    expect(curveTiming({ ...base, plan: "off" }).kind).toBe("instant");
  });

  it("wybudzenie: krótkie rysowanie od startu", () => {
    expect(curveTiming({ ...base, plan: "wake", phase: "reveal", revealedAt: 100 })).toMatchObject({
      kind: "draw",
      startAt: 100 + BOOT_WAKE.curve.at,
    });
  });
});
