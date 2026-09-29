import { describe, expect, it } from "vitest";
import { dayBrief, greeting, isWetHour, recipePrompt } from "@/lib/brief";
import { demoWeather } from "@/lib/weather/demo";
import type { HourlyForecast, WeatherData } from "@/lib/weather/schema";

// 29.09.2026, Warszawa = UTC+2.
const at = (localHour: number) => new Date(Date.UTC(2026, 8, 29, localHour - 2, 10));

function hours(fromLocalHour: number, mm: number[], state: HourlyForecast["state"] = "rain"): HourlyForecast[] {
  return mm.map((value, i) => ({
    time: new Date(Date.UTC(2026, 8, 29, fromLocalHour + i - 2)).toISOString(),
    state: value > 0 ? state : "cloudy",
    precipitationMm: value,
    precipitationProbability: value > 0 ? 80 : 10,
  }));
}

function weather(overrides: Partial<WeatherData>, current: Partial<WeatherData["current"]> = {}): WeatherData {
  const base = demoWeather(at(9));
  return {
    ...base,
    ...overrides,
    current: { ...base.current, state: "cloudy", precipitationMmH: 0, ...current },
  };
}

function withDay(w: WeatherData, index: number, patch: Partial<WeatherData["daily"][number]>): WeatherData {
  return { ...w, daily: w.daily.map((d, i) => (i === index ? { ...d, ...patch } : d)) };
}

describe("greeting", () => {
  it.each([
    [5, "Dzień dobry."],
    [12, "Dzień dobry."],
    [17, "Dzień dobry."],
    [18, "Dobry wieczór."],
    [23, "Dobry wieczór."],
    [3, "Dobry wieczór."],
  ])("%i:00 → %s", (hour, expected) => {
    expect(greeting(hour)).toBe(expected);
  });
});

describe("isWetHour", () => {
  it("opad ≥ 0,2 mm albo prawdopodobny opad przy opadowej pogodzie", () => {
    expect(isWetHour({ time: "", state: "cloudy", precipitationMm: 0.2, precipitationProbability: 0 })).toBe(true);
    expect(isWetHour({ time: "", state: "rain", precipitationMm: 0, precipitationProbability: 70 })).toBe(true);
    expect(isWetHour({ time: "", state: "cloudy", precipitationMm: 0, precipitationProbability: 90 })).toBe(false);
    expect(isWetHour({ time: "", state: "rain", precipitationMm: 0.1, precipitationProbability: null })).toBe(false);
  });
});

describe("dayBrief", () => {
  it("deszcz zaczyna się później: „Od 14:00 pada, weź parasol.”", () => {
    const w = weather({ hourly: hours(9, [0, 0, 0, 0, 0, 1.2, 0.8]) });
    expect(dayBrief(w, at(9))).toBe("Od 14:00 pada, weź parasol.");
  });

  it("burza ma pierwszeństwo przed deszczem", () => {
    const w = weather({ hourly: [...hours(9, [0, 0, 0.5]), ...hours(12, [2], "storm")] });
    expect(dayBrief(w, at(9))).toBe("Od 11:00 burza, lepiej zostań w środku.");
  });

  it("pada teraz i przestaje: „Pada do 12:00, potem przejaśnienie.”", () => {
    const w = weather({ hourly: hours(9, [1, 1, 0.4, 0, 0]) }, { state: "rain", precipitationMmH: 1 });
    expect(dayBrief(w, at(9))).toBe("Pada do 12:00, potem przejaśnienie.");
  });

  it("pada przez całe okno briefu", () => {
    const w = weather({ hourly: hours(9, Array<number>(13).fill(1)) }, { state: "rain", precipitationMmH: 1 });
    expect(dayBrief(w, at(9))).toBe("Pada jeszcze długo, weź parasol.");
  });

  it("śnieg", () => {
    const w = weather({ hourly: hours(9, [0, 0, 0.6], "snow") });
    expect(dayBrief(w, at(9))).toBe("Od 11:00 pada śnieg, ubierz się ciepło.");
  });

  it("ignoruje godziny, które już minęły", () => {
    const w = weather({ hourly: hours(6, [2, 2, 0, 0, 0, 0, 0, 0]) });
    expect(dayBrief(w, at(9))).toMatch(/^Dziś bez deszczu/);
  });

  it("sucho w dzień: stan i maksymalna temperatura", () => {
    const w = withDay(weather({ hourly: hours(9, [0, 0, 0]) }, { state: "sunny" }), 0, { temperatureMaxC: 21.4 });
    expect(dayBrief(w, at(9))).toBe("Słonecznie i sucho, do 21°.");
  });

  it("sucho wieczorem: jutrzejsze maksimum", () => {
    const w = withDay(weather({ hourly: hours(19, [0, 0, 0]) }), 1, { temperatureMaxC: 19.6 });
    expect(dayBrief(w, at(19))).toBe("Wieczór bez deszczu. Jutro do 20°.");
  });

  it("brak prognozy godzinowej (stara kopia): sygnał z prognozy dziennej", () => {
    const w = withDay(weather({ hourly: [] }), 0, { precipitationSumMm: 6, temperatureMaxC: 12 });
    expect(dayBrief(w, at(9))).toBe("Dziś deszczowo, do 12°. Weź parasol.");
  });

  it("godziny w strefie lokalizacji pogody, nie serwera", () => {
    const w = weather({ timezone: "America/New_York", hourly: hours(9, [0, 0, 1]) });
    // 11:00 w Warszawie = 05:00 w Nowym Jorku.
    expect(dayBrief(w, at(9))).toBe("Od 05:00 pada, weź parasol.");
  });
});

describe("recipePrompt", () => {
  it("dopasowuje przepis do pogody", () => {
    expect(recipePrompt("rain", 12)).toBe("Przepis na deszcz");
    expect(recipePrompt("storm", 20)).toBe("Przepis na deszcz");
    expect(recipePrompt("snow", 1)).toBe("Przepis na chłód");
    expect(recipePrompt("cloudy", 5)).toBe("Przepis na chłód");
    expect(recipePrompt("sunny", 24)).toBe("Przepis na słońce");
    expect(recipePrompt("cloudy", 15)).toBe("Przepis na dziś");
  });
});
