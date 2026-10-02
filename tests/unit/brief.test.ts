import { describe, expect, it } from "vitest";
import { composeBrief, dayBrief, greeting, isWetHour, recipePrompt, type BriefContext } from "@/lib/brief";
import type { Reminder } from "@/lib/reminders/reminders";
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

  it("wariant zwięzły pomija dopiski o temperaturze", () => {
    const evening = withDay(weather({ hourly: hours(19, [0, 0, 0]) }), 1, { temperatureMaxC: 19.6 });
    expect(dayBrief(evening, at(19), true)).toBe("Wieczór bez deszczu.");
    const sunny = withDay(weather({ hourly: hours(9, [0, 0, 0]) }, { state: "sunny" }), 0, { temperatureMaxC: 21.4 });
    expect(dayBrief(sunny, at(9), true)).toBe("Słonecznie i sucho.");
  });

  it("sucho wieczorem: jutrzejsze maksimum", () => {
    const w = withDay(weather({ hourly: hours(19, [0, 0, 0]) }), 1, { temperatureMaxC: 19.6 });
    expect(dayBrief(w, at(19))).toBe("Wieczór bez deszczu, jutro do 20°.");
  });

  it("brak prognozy godzinowej (stara kopia): sygnał z prognozy dziennej", () => {
    const w = withDay(weather({ hourly: [] }), 0, { precipitationSumMm: 6, temperatureMaxC: 12 });
    expect(dayBrief(w, at(9))).toBe("Dziś deszczowo, weź parasol, do 12°.");
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

describe("composeBrief", () => {
  const now = at(9);
  const reminder = (title: string, plusMin: number, done = false): Reminder => ({
    id: title,
    title,
    at: new Date(now.getTime() + plusMin * 60_000).toISOString(),
    done,
  });
  const ctx = (patch: Partial<BriefContext> = {}): BriefContext => ({
    remaining: 0,
    next: null,
    now,
    timeZone: "Europe/Warsaw",
    ...patch,
  });

  it("bez niczego do dodania zostaje samo zdanie o pogodzie", () => {
    expect(composeBrief("Dziś bez deszczu.", ctx())).toBe("Dziś bez deszczu.");
  });

  it("przypomnienie po terminie ma pierwszeństwo przed wszystkim", () => {
    expect(composeBrief("Pada.", ctx({ next: reminder("Dentysta", -3), remaining: 4 }))).toBe("Pada. Teraz: Dentysta.");
  });

  it("najbliższe przypomnienie dziś ma pierwszeństwo przed listą", () => {
    expect(composeBrief("Pada.", ctx({ next: reminder("Dentysta", 90), remaining: 4 }))).toBe("Pada. Dentysta o 10:40.");
  });

  it("przypomnienie jutro ustępuje liście; lista z odmianą", () => {
    const tomorrow = reminder("Paczka", 24 * 60);
    expect(composeBrief("Pada.", ctx({ next: tomorrow, remaining: 1 }))).toBe("Pada. Do kupienia 1 rzecz.");
    expect(composeBrief("Pada.", ctx({ next: tomorrow, remaining: 3 }))).toBe("Pada. Do kupienia 3 rzeczy.");
    expect(composeBrief("Pada.", ctx({ next: tomorrow, remaining: 7 }))).toBe("Pada. Do kupienia 7 rzeczy.");
    expect(composeBrief("Pada.", ctx({ next: tomorrow }))).toBe("Pada.");
  });

  it("budżet znaków: długi tytuł jest skracany, a gdy brak miejsca zostaje sama pogoda", () => {
    const long = reminder("Bardzo długi tytuł przypomnienia o spotkaniu", 90);
    const short = composeBrief("Pada.", ctx({ next: long }));
    expect(short).toBe("Pada. Bardzo długi tytuł przypomnienia o s… o 10:40.");
    expect(short.length).toBeLessThanOrEqual(52);
    const storm = "Od 11:00 burza, lepiej zostań w środku.";
    expect(composeBrief(storm, ctx({ next: reminder("Dentysta", 90) }))).toBe(storm);
    expect(composeBrief(storm, ctx({ next: reminder("Dentysta", -3) }))).toBe(storm);
    expect(composeBrief(storm, ctx({ remaining: 3 }))).toBe(storm);
  });

  it("gdy pełne zdanie o pogodzie się nie mieści, używa krótszego", () => {
    const full = "Wieczór bez deszczu, jutro do 19°.";
    expect(composeBrief(full, ctx({ remaining: 2 }), "Wieczór bez deszczu.")).toBe(
      "Wieczór bez deszczu. Do kupienia 2 rzeczy.",
    );
    expect(composeBrief(full, ctx(), "Wieczór bez deszczu.")).toBe(full);
  });
});
