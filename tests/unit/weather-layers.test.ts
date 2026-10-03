import { describe, expect, it } from "vitest";
import { FrameLoop, MAX_FRAME_DT_S, type FrameScheduler, type VisibilitySource } from "@/lib/frame-loop";
import {
  FlashLimiter,
  flashKeyframes,
  LightningScheduler,
  MAX_FLASHES_PER_SECOND,
  nextStrikeDelay,
  planStrike,
  STRIKE_INTERVAL_MS,
  type Clock,
  type Strike,
} from "@/lib/lightning";
import {
  activeRanges,
  createField,
  fieldCapacity,
  particleCounts,
  REFERENCE_AREA,
  stepField,
  windSlant,
} from "@/lib/precipitation";
import {
  compassDirection,
  currentConditions,
  dayConditions,
  effectiveIntensity,
  orbRainStrength,
} from "@/lib/scene-conditions";
import { resolveScene, SCENES, WEATHER_STATES } from "@/lib/scenes";
import { demoWeather } from "@/lib/weather/demo";

/** Deterministyczny generator (mulberry32). */
function seeded(seed = 1): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FakeVisibility implements VisibilitySource {
  hidden = false;
  private listeners = new Set<() => void>();
  isHidden(): boolean {
    return this.hidden;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  set(hidden: boolean): void {
    this.hidden = hidden;
    this.listeners.forEach((listener) => listener());
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

class FakeFrames implements FrameScheduler {
  private next = 1;
  readonly pending = new Map<number, (now: number) => void>();
  request(callback: (now: number) => void): number {
    const id = this.next++;
    this.pending.set(id, callback);
    return id;
  }
  cancel(handle: number): void {
    this.pending.delete(handle);
  }
  flush(now: number): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    callbacks.forEach((callback) => callback(now));
  }
}

class FakeClock implements Clock {
  time = 0;
  private next = 1;
  readonly timers = new Map<number, { at: number; callback: () => void }>();
  now(): number {
    return this.time;
  }
  setTimeout(callback: () => void, ms: number): number {
    const id = this.next++;
    this.timers.set(id, { at: this.time + ms, callback });
    return id;
  }
  clearTimeout(handle: number): void {
    this.timers.delete(handle);
  }
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].callback();
    }
    this.time = end;
  }
}

describe("zestaw warstw sceny", () => {
  it("odpowiada tabeli stanów", () => {
    const summary = Object.fromEntries(
      WEATHER_STATES.map((state) => {
        const e = SCENES[state].effects;
        const on = [
          e.precipitation && `opad:${e.precipitation}`,
          e.lightning && "pioruny",
          e.fog && "mgła",
          e.beam && "snop",
          e.motes && "pyłki",
        ].filter(Boolean);
        return [state, on.join(" ")];
      }),
    );
    expect(summary).toEqual({
      sunny: "pyłki",
      cloudy: "",
      fog: "mgła",
      drizzle: "opad:rain",
      rain: "opad:rain snop",
      snow: "opad:snow",
      storm: "opad:rain pioruny snop",
    });
  });

  it("pora dnia: pyłki w dzień i w złotą godzinę, snop przy deszczu i burzy także nocą", () => {
    const summary = (period: "golden" | "night") =>
      Object.fromEntries(
        WEATHER_STATES.map((state) => {
          const e = resolveScene(state, period).effects;
          const on = [
            e.precipitation && `opad:${e.precipitation}`,
            e.lightning && "pioruny",
            e.fog && "mgła",
            e.beam && "snop",
            e.motes && "pyłki",
          ].filter(Boolean);
          return [state, on.join(" ")];
        }),
      );
    expect(summary("golden")).toEqual({
      sunny: "pyłki",
      cloudy: "",
      fog: "mgła",
      drizzle: "opad:rain",
      rain: "opad:rain snop",
      snow: "opad:snow",
      storm: "opad:rain pioruny snop",
    });
    expect(summary("night")).toEqual({
      sunny: "",
      cloudy: "",
      fog: "mgła",
      drizzle: "opad:rain",
      rain: "opad:rain snop",
      snow: "opad:snow",
      storm: "opad:rain pioruny snop",
    });
  });

  it("burza ma ciemniejszy grading niż deszcz (token sceny)", () => {
    expect(SCENES.storm.tokens.videoFilter.brightness).toBeLessThan(SCENES.rain.tokens.videoFilter.brightness);
  });
});

describe("warunki sceny", () => {
  const weather = demoWeather(new Date("2026-10-03T10:00:00Z"));

  it("opad ma minimum dla stanu, mżawka ma maksimum", () => {
    expect(effectiveIntensity("rain", 0)).toBe(2);
    expect(effectiveIntensity("rain", 12)).toBe(12);
    expect(effectiveIntensity("storm", 3)).toBe(8);
    expect(effectiveIntensity("drizzle", 5)).toBe(1);
    expect(effectiveIntensity("sunny", 5)).toBe(0);
    expect(effectiveIntensity("rain", Number.NaN)).toBe(2);
  });

  it("override zmienia stan, wiatr zostaje prawdziwy", () => {
    const conditions = currentConditions(weather, "storm");
    expect(conditions).toMatchObject({ state: "storm", intensityMmH: 8, windKmh: 18, windDirectionDeg: 250 });
    expect(currentConditions(weather, null).state).toBe("rain");
  });

  it("dzień z prognozy: opad z sumy dobowej, wiatr maksymalny i dominujący kierunek", () => {
    const day = { ...weather.daily[0]!, state: "rain" as const, precipitationSumMm: 30, windMaxKmh: 40, windDirectionDeg: 200 };
    expect(dayConditions(day)).toEqual({ state: "rain", intensityMmH: 5, windKmh: 40, windDirectionDeg: 200 });
    expect(dayConditions({ ...day, precipitationSumMm: null, windMaxKmh: null }).windKmh).toBe(0);
  });

  it("krople na kuli tylko przy deszczu, mżawce i burzy; rosną z mm/h", () => {
    expect(orbRainStrength("snow", 5)).toBe(0);
    expect(orbRainStrength("rain", 0)).toBe(0);
    const drizzle = orbRainStrength("drizzle", 0.3);
    const rain = orbRainStrength("rain", 2);
    const storm = orbRainStrength("storm", 8);
    expect(drizzle).toBeGreaterThanOrEqual(0.25);
    expect(rain).toBeGreaterThan(drizzle);
    expect(storm).toBeGreaterThan(rain);
    expect(orbRainStrength("storm", 500)).toBe(1);
  });

  it("róża wiatrów", () => {
    expect(compassDirection(0).short).toBe("N");
    expect(compassDirection(250).short).toBe("W");
    expect(compassDirection(225)).toEqual({ short: "SW", long: "południowo-zachodni" });
    expect(compassDirection(-45).short).toBe("NW");
    expect(compassDirection(359).short).toBe("N");
  });
});

describe("opad", () => {
  it("gęstość rośnie z mm/h i z powierzchnią ekranu, bliska warstwa rzadsza", () => {
    const drizzle = particleCounts("rain", 0.3, REFERENCE_AREA);
    const rain = particleCounts("rain", 2, REFERENCE_AREA);
    const storm = particleCounts("rain", 8, REFERENCE_AREA);
    expect(drizzle.far).toBeLessThan(rain.far);
    expect(rain.far).toBeLessThan(storm.far);
    expect(storm.near).toBeLessThan(storm.far);
    expect(particleCounts("rain", 2, REFERENCE_AREA / 4).far).toBeLessThan(rain.far);
    expect(particleCounts("rain", 0, REFERENCE_AREA)).toEqual({ far: 0, near: 0 });
  });

  it("pojemność pola mieści każdą gęstość", () => {
    const capacity = fieldCapacity("rain");
    const extreme = particleCounts("rain", 40, REFERENCE_AREA * 10);
    expect(capacity.far).toBeGreaterThanOrEqual(extreme.far);
    expect(capacity.near).toBeGreaterThanOrEqual(extreme.near);
  });

  it("kąt z wiatru: zachodni znosi w prawo, wschodni w lewo, z limitem", () => {
    expect(windSlant("rain", 20, 270)).toBe(0.45);
    expect(windSlant("rain", 10, 270)).toBeCloseTo(0.25);
    expect(windSlant("rain", 10, 90)).toBeCloseTo(-0.25);
    expect(windSlant("rain", 10, 0)).toBeCloseTo(0);
    expect(windSlant("rain", 200, 270)).toBe(0.45);
    expect(windSlant("snow", 10, 270)).toBeGreaterThan(windSlant("rain", 10, 270));
    expect(windSlant("rain", 30, null)).toBe(0);
  });

  it("krok: cząstki spadają, wracają nad ekran i nie uciekają w bok", () => {
    const random = seeded(3);
    const field = createField("rain", { far: 50, near: 20 }, 800, 600, random);
    const active = { far: 50, near: 20 };
    const before = Array.from(field.y.slice(0, 5));
    stepField(field, active, 0.016, 0.3, 0, random);
    for (let i = 0; i < 5; i++) expect(field.y[i]!).toBeGreaterThan(before[i]!);
    for (let k = 0; k < 600; k++) stepField(field, active, 0.05, 0.4, k * 0.05, random);
    for (let i = 0; i < field.count; i++) {
      expect(field.x[i]!).toBeGreaterThanOrEqual(0);
      expect(field.x[i]!).toBeLessThan(800);
      expect(field.y[i]! - field.size[i]!).toBeLessThanOrEqual(600 + 2000 * 0.05);
    }
  });

  it("aktywny zakres przycięty do pojemności każdej warstwy", () => {
    const field = createField("snow", { far: 10, near: 4 }, 100, 100, seeded());
    expect(activeRanges(field, { far: 7.4, near: 99 })).toEqual([
      [0, 7],
      [10, 14],
    ]);
  });
});

describe("pioruny", () => {
  it("odstępy 6–15 s", () => {
    expect(nextStrikeDelay(() => 0)).toBe(STRIKE_INTERVAL_MS.min);
    expect(nextStrikeDelay(() => 0.999999)).toBe(STRIKE_INTERVAL_MS.max);
  });

  it("błysk trwa 100–200 ms, ma 1–2 mignięcia, czasem bez pioruna", () => {
    const random = seeded(11);
    let clouds = 0;
    for (let i = 0; i < 500; i++) {
      const strike = planStrike(random);
      expect(strike.duration).toBeGreaterThanOrEqual(100);
      expect(strike.duration).toBeLessThanOrEqual(200);
      expect(strike.pulses.length).toBeGreaterThanOrEqual(1);
      expect(strike.pulses.length).toBeLessThanOrEqual(2);
      if (strike.bolt === null) clouds += 1;
      else expect([0, 1, 2]).toContain(strike.bolt);
    }
    expect(clouds).toBeGreaterThan(50);
    expect(clouds).toBeLessThan(250);
  });

  it("klatki kluczowe: zaczynają i kończą się ciemnością, czasy rosnące w [0, 1]", () => {
    const strike: Strike = {
      bolt: 0,
      pulses: [
        { at: 0, duration: 80, peak: 1 },
        { at: 115, duration: 50, peak: 0.55 },
      ],
      duration: 165,
    };
    const { values, times, duration } = flashKeyframes(strike);
    expect(duration).toBe(165);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(0);
    expect(Math.max(...values)).toBe(1);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(1);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(values).toHaveLength(times.length);
  });

  it("limit: nigdy więcej niż 3 mignięcia w dowolnej sekundzie (WCAG 2.3.1)", () => {
    const limiter = new FlashLimiter();
    const double: Strike = {
      bolt: 1,
      pulses: [
        { at: 0, duration: 70, peak: 1 },
        { at: 100, duration: 50, peak: 0.5 },
      ],
      duration: 150,
    };
    const shown: number[] = [];
    // Złośliwy harmonogram: błysk co 200 ms.
    for (let at = 0; at < 5000; at += 200) {
      const admitted = limiter.admit(double, at);
      if (admitted) admitted.pulses.forEach((pulse) => shown.push(at + pulse.at));
    }
    for (const start of shown) {
      const inWindow = shown.filter((t) => t >= start && t < start + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(MAX_FLASHES_PER_SECOND);
    }
    expect(shown.length).toBeGreaterThan(0);
  });

  it("harmonogram: błyski w trakcie, brak timera przy ukrytej karcie, nowy odstęp po powrocie", () => {
    const clock = new FakeClock();
    const visibility = new FakeVisibility();
    const strikes: Strike[] = [];
    const scheduler = new LightningScheduler({ clock, visibility, onStrike: (s) => strikes.push(s), random: seeded(5) });

    scheduler.setEnabled(true);
    expect(scheduler.scheduled).toBe(true);
    clock.advance(60_000);
    expect(strikes.length).toBeGreaterThanOrEqual(4);
    expect(strikes.length).toBeLessThanOrEqual(10);

    visibility.set(true);
    expect(scheduler.scheduled).toBe(false);
    expect(clock.timers.size).toBe(0);
    const count = strikes.length;
    clock.advance(120_000);
    expect(strikes.length).toBe(count);

    visibility.set(false);
    expect(scheduler.scheduled).toBe(true);
    clock.advance(STRIKE_INTERVAL_MS.min - 1);
    expect(strikes.length).toBe(count);

    scheduler.dispose();
    expect(clock.timers.size).toBe(0);
    expect(visibility.listenerCount).toBe(0);
  });
});

describe("pętla klatek warstw", () => {
  it("staje przy ukrytej karcie i wraca po pokazaniu, z dt = 0 po wznowieniu", () => {
    const visibility = new FakeVisibility();
    const frames = new FakeFrames();
    const ticks: number[] = [];
    const loop = new FrameLoop((dt) => ticks.push(dt), visibility, frames);

    expect(loop.running).toBe(false);
    loop.setEnabled(true);
    expect(loop.running).toBe(true);
    frames.flush(1000);
    frames.flush(1016);
    expect(ticks).toEqual([0, expect.closeTo(0.016, 5)]);

    visibility.set(true);
    expect(loop.running).toBe(false);
    expect(frames.pending.size).toBe(0);

    visibility.set(false);
    expect(loop.running).toBe(true);
    frames.flush(9000);
    expect(ticks.at(-1)).toBe(0);
    frames.flush(9500);
    expect(ticks.at(-1)).toBe(MAX_FRAME_DT_S);

    loop.dispose();
    expect(loop.running).toBe(false);
    expect(visibility.listenerCount).toBe(0);
  });

  it("wyłączona (reduced motion) nie rusza nawet przy widocznej karcie", () => {
    const visibility = new FakeVisibility();
    const frames = new FakeFrames();
    const loop = new FrameLoop(() => {}, visibility, frames);
    loop.setEnabled(false);
    visibility.set(false);
    expect(loop.running).toBe(false);
    expect(frames.pending.size).toBe(0);
  });
});
