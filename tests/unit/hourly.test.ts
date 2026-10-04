import { describe, expect, it } from "vitest";
import { demoWeather } from "@/lib/weather/demo";
import { axisHour, hourlyCurve, labeledHours } from "@/lib/weather/hourly";

const NOW = new Date("2026-09-29T11:20:00Z"); // 13:20 w Warszawie
const TZ = "Europe/Warsaw";
const BOX = { width: 1000, height: 100, inset: 20 };

describe("krzywa godzinowa okna Pogody", () => {
  it("oś doby: godziny tego dnia, 24 = północ następnego, reszta poza osią", () => {
    expect(axisHour("2026-09-29T06:00:00+02:00", "2026-09-29", TZ)).toBe(6);
    expect(axisHour("2026-09-30T00:00:00+02:00", "2026-09-29", TZ)).toBe(24);
    expect(axisHour("2026-09-30T01:00:00+02:00", "2026-09-29", TZ)).toBeNull();
    expect(axisHour("2026-09-28T23:00:00+02:00", "2026-09-29", TZ)).toBeNull();
  });

  it("zakres 6:00–24:00 rozłożony na całą szerokość, bieżąca godzina zaznaczona", () => {
    const weather = demoWeather(NOW);
    const curve = hourlyCurve(weather.hourly, "2026-09-29", weather.daily[0], TZ, BOX, NOW);
    expect(curve.points).toHaveLength(19);
    expect(curve.points[0]).toMatchObject({ hour: 6, x: 20 });
    expect(curve.points.at(-1)).toMatchObject({ hour: 24, x: 980 });
    expect(curve.now?.hour).toBe(13);
    expect(curve.area.endsWith("Z")).toBe(true);
    // Inny dzień: bez „teraz”.
    expect(hourlyCurve(weather.hourly, "2026-09-30", weather.daily[1], TZ, BOX, null).now).toBeNull();
  });

  it("podpisy temperatur co 4 h i przy bieżącej godzinie; sąsiedni znacznik ustępuje bieżącej", () => {
    const weather = demoWeather(NOW);
    const curve = hourlyCurve(weather.hourly, "2026-09-29", weather.daily[0], TZ, BOX, NOW);
    expect([...labeledHours(curve.points, curve.now)].sort((a, b) => a - b)).toEqual([6, 10, 13, 18, 22]);
    expect([...labeledHours(curve.points, null)].sort((a, b) => a - b)).toEqual([6, 10, 14, 18, 22]);
  });
});
