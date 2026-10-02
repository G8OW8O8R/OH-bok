import { describe, expect, it } from "vitest";
import { PARALLAX_PX, parallaxOffset, pointerToUnit } from "@/lib/parallax";
import { pluralPl } from "@/lib/plural";
import { dateIn, formatClock, formatCountdown, formatTime, hourIn, minutesUntil, weekdayShort } from "@/lib/time";
import { temperatureCurve } from "@/lib/weather/curve";
import { demoWeather } from "@/lib/weather/demo";

const NOW = new Date("2026-09-29T06:47:30Z"); // 08:47 w Warszawie

describe("time", () => {
  it("formatuje zegar po polsku w podanej strefie", () => {
    expect(formatClock(NOW, "Europe/Warsaw")).toBe("Wt, 29 wrz · 08:47");
    expect(formatTime(NOW, "UTC")).toBe("06:47");
    expect(hourIn(NOW, "Asia/Tokyo")).toBe(15);
    expect(dateIn(new Date("2026-09-29T23:30:00Z"), "Europe/Warsaw")).toBe("2026-09-30");
  });

  it("skróty dni tygodnia z daty kalendarzowej", () => {
    const week = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    expect(week.map(weekdayShort)).toEqual(["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"]);
  });

  it("odliczanie", () => {
    expect(minutesUntil(new Date(NOW.getTime() + 14.5 * 60_000), NOW)).toBe(15);
    expect(formatCountdown(15)).toBe("Za 15 min");
    expect(formatCountdown(60)).toBe("Za 1 h");
    expect(formatCountdown(85)).toBe("Za 1 h 25 min");
    expect(formatCountdown(0)).toBe("Teraz");
    expect(formatCountdown(-3)).toBe("Teraz");
  });
});

describe("pluralPl", () => {
  const forms = ["składnik", "składniki", "składników"] as const;
  it.each([
    [1, "składnik"],
    [2, "składniki"],
    [4, "składniki"],
    [5, "składników"],
    [12, "składników"],
    [14, "składników"],
    [22, "składniki"],
    [25, "składników"],
    [0, "składników"],
  ])("%i %s", (n, expected) => {
    expect(pluralPl(n, forms)).toBe(expected);
  });
});

describe("parallax", () => {
  it("normalizuje kursor do [-1, 1]", () => {
    expect(pointerToUnit(0, 1000)).toBe(-1);
    expect(pointerToUnit(500, 1000)).toBe(0);
    expect(pointerToUnit(1000, 1000)).toBe(1);
    expect(pointerToUnit(1500, 1000)).toBe(1);
    expect(pointerToUnit(10, 0)).toBe(0);
  });

  it("bliżej = mocniej, przeciwnie do kursora", () => {
    expect(parallaxOffset(1, "near")).toBe(-PARALLAX_PX.near);
    expect(parallaxOffset(-1, "far")).toBe(PARALLAX_PX.far);
    expect(parallaxOffset(0, "mid")).toBe(0);
    expect(PARALLAX_PX.far).toBeLessThan(PARALLAX_PX.mid);
    expect(PARALLAX_PX.mid).toBeLessThan(PARALLAX_PX.near);
  });
});

describe("temperatureCurve", () => {
  const days = demoWeather(NOW).daily; // maksima 14, 12, 15, 17, 13
  const box = { width: 200, height: 60, inset: 8 };

  it("punkty w środkach kolumn dni, najcieplejszy najwyżej", () => {
    const { points, path, area } = temperatureCurve(days, box);
    expect(points.map((p) => p.x)).toEqual([20, 60, 100, 140, 180]);
    const warmest = points.reduce((a, b) => (b.temperatureC > a.temperatureC ? b : a));
    expect(warmest.y).toBe(8);
    expect(Math.max(...points.map((p) => p.y))).toBe(52);
    expect(path.startsWith("M20,")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(4);
    expect(area.endsWith("Z")).toBe(true);
  });

  it("dni bez danych są pomijane, płaski tydzień rysuje się na środku", () => {
    const withGap = days.map((d, i) => (i === 1 ? { ...d, temperatureMaxC: null } : d));
    expect(temperatureCurve(withGap, box).points).toHaveLength(4);
    const flat = days.map((d) => ({ ...d, temperatureMaxC: 10 }));
    expect(temperatureCurve(flat, box).points.every((p) => p.y === 30)).toBe(true);
  });

  it("za mało punktów = brak ścieżki", () => {
    const one = days.map((d, i) => ({ ...d, temperatureMaxC: i === 0 ? 10 : null }));
    expect(temperatureCurve(one, box)).toMatchObject({ path: "", area: "" });
    expect(temperatureCurve([], box).points).toEqual([]);
  });
});
