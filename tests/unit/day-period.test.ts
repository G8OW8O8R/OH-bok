import { describe, expect, it } from "vitest";
import { dayPeriod, GOLDEN_HALF_WINDOW_MS, nextPeriodChange, parseTimeOverride } from "@/lib/day-period";

type SunDay = { sunrise: string | null; sunset: string | null };

/** Gdańsk na początku października (CEST, +02:00). */
const GDANSK: SunDay[] = [
  { sunrise: "2026-10-03T06:53:00+02:00", sunset: "2026-10-03T18:28:00+02:00" },
  { sunrise: "2026-10-04T06:55:00+02:00", sunset: "2026-10-04T18:25:00+02:00" },
];

const at = (iso: string) => new Date(iso);
const MIN = 60_000;

describe("dayPeriod", () => {
  it("dzień między złotymi godzinami, noc poza nimi", () => {
    expect(dayPeriod(at("2026-10-03T12:00:00+02:00"), GDANSK, true)).toBe("day");
    expect(dayPeriod(at("2026-10-03T21:00:00+02:00"), GDANSK, true)).toBe("night");
    expect(dayPeriod(at("2026-10-03T04:00:00+02:00"), GDANSK, true)).toBe("night");
  });

  it("złota godzina ±45 min wokół wschodu i zachodu, granice włącznie", () => {
    const sunset = Date.parse("2026-10-03T18:28:00+02:00");
    const sunrise = Date.parse("2026-10-03T06:53:00+02:00");
    for (const event of [sunrise, sunset]) {
      expect(dayPeriod(new Date(event), GDANSK, true)).toBe("golden");
      expect(dayPeriod(new Date(event - GOLDEN_HALF_WINDOW_MS), GDANSK, true)).toBe("golden");
      expect(dayPeriod(new Date(event + GOLDEN_HALF_WINDOW_MS), GDANSK, true)).toBe("golden");
    }
    expect(dayPeriod(new Date(sunrise - GOLDEN_HALF_WINDOW_MS - MIN), GDANSK, true)).toBe("night");
    expect(dayPeriod(new Date(sunrise + GOLDEN_HALF_WINDOW_MS + MIN), GDANSK, false)).toBe("day");
    expect(dayPeriod(new Date(sunset - GOLDEN_HALF_WINDOW_MS - MIN), GDANSK, false)).toBe("day");
    expect(dayPeriod(new Date(sunset + GOLDEN_HALF_WINDOW_MS + MIN), GDANSK, true)).toBe("night");
  });

  it("przejście przez północ: noc trwa, choć prognoza ma już nową datę", () => {
    expect(dayPeriod(at("2026-10-03T23:59:00+02:00"), GDANSK, false)).toBe("night");
    expect(dayPeriod(at("2026-10-04T00:01:00+02:00"), GDANSK, false)).toBe("night");
    // Nieaktualna prognoza (ostatni dzień minął): noc po ostatnim zachodzie.
    expect(dayPeriod(at("2026-10-05T01:00:00+02:00"), GDANSK, false)).toBe("night");
  });

  it("złota godzina przechodząca przez północ (zachód 23:40, wschód 00:20)", () => {
    const north: SunDay[] = [
      { sunrise: "2026-06-20T00:20:00+03:00", sunset: "2026-06-20T23:40:00+03:00" },
      { sunrise: "2026-06-21T00:22:00+03:00", sunset: "2026-06-21T23:39:00+03:00" },
    ];
    expect(dayPeriod(at("2026-06-21T00:10:00+03:00"), north, false)).toBe("golden");
    expect(dayPeriod(at("2026-06-19T23:40:00+03:00"), north, false)).toBe("golden");
    expect(dayPeriod(at("2026-06-20T12:00:00+03:00"), north, false)).toBe("day");
  });

  it("strefa czasowa: liczy się chwila, nie data w UTC", () => {
    const newYork: SunDay[] = [{ sunrise: "2026-10-03T06:59:00-04:00", sunset: "2026-10-03T18:37:00-04:00" }];
    // 22:30 w Nowym Jorku = 02:30 UTC następnego dnia: wciąż noc po zachodzie z 3 października.
    expect(dayPeriod(at("2026-10-04T02:30:00Z"), newYork, true)).toBe("night");
    // 13:00 UTC = 09:00 w Nowym Jorku: dzień.
    expect(dayPeriod(at("2026-10-03T13:00:00Z"), newYork, false)).toBe("day");
    // 22:20 UTC = 18:20 w Nowym Jorku: złota godzina.
    expect(dayPeriod(at("2026-10-03T22:20:00Z"), newYork, false)).toBe("golden");
  });

  it("noc i dzień polarny (brak wschodu i zachodu): pora z is_day", () => {
    const polar: SunDay[] = [
      { sunrise: null, sunset: null },
      { sunrise: null, sunset: null },
    ];
    expect(dayPeriod(at("2026-12-21T12:00:00+01:00"), polar, false)).toBe("night");
    expect(dayPeriod(at("2026-06-21T00:00:00+02:00"), polar, true)).toBe("day");
  });

  it("koniec dnia polarnego: brak wschodu, jest zachód", () => {
    const ending: SunDay[] = [{ sunrise: null, sunset: "2026-07-25T01:30:00+02:00" }];
    expect(dayPeriod(at("2026-07-24T22:00:00+02:00"), ending, true)).toBe("day");
    expect(dayPeriod(at("2026-07-25T03:00:00+02:00"), ending, true)).toBe("night");
  });

  it("brak danych: pora z is_day; zdarzenia sprzed ponad doby nie rozstrzygają", () => {
    expect(dayPeriod(at("2026-10-03T12:00:00+02:00"), [], true)).toBe("day");
    expect(dayPeriod(at("2026-10-03T12:00:00+02:00"), [], false)).toBe("night");
    expect(dayPeriod(at("2026-10-07T12:00:00+02:00"), GDANSK, true)).toBe("day");
  });

  it("niepoprawny zapis czasu jest pomijany", () => {
    const broken: SunDay[] = [{ sunrise: "jutro", sunset: "2026-10-03T18:28:00+02:00" }];
    expect(dayPeriod(at("2026-10-03T12:00:00+02:00"), broken, false)).toBe("day");
  });
});

describe("nextPeriodChange", () => {
  it("najbliższa granica złotej godziny", () => {
    expect(nextPeriodChange(at("2026-10-03T12:00:00+02:00"), GDANSK)?.toISOString()).toBe("2026-10-03T15:43:00.000Z");
    // W złotej godzinie: koniec okna (1 ms po granicy włącznie).
    expect(nextPeriodChange(at("2026-10-03T18:30:00+02:00"), GDANSK)?.getTime()).toBe(
      Date.parse("2026-10-03T19:13:00+02:00") + 1,
    );
    expect(nextPeriodChange(at("2026-10-03T22:00:00+02:00"), GDANSK)?.toISOString()).toBe("2026-10-04T04:10:00.000Z");
  });

  it("brak przyszłych zdarzeń = null", () => {
    expect(nextPeriodChange(at("2026-10-06T00:00:00+02:00"), GDANSK)).toBeNull();
    expect(nextPeriodChange(at("2026-10-03T12:00:00+02:00"), [])).toBeNull();
  });

  it("zmiana pory następuje dokładnie w zwróconej chwili", () => {
    let now = at("2026-10-03T05:00:00+02:00");
    const seen = [dayPeriod(now, GDANSK, false)];
    for (let i = 0; i < 4; i++) {
      const next = nextPeriodChange(now, GDANSK);
      if (!next) break;
      expect(dayPeriod(new Date(next.getTime() - 1), GDANSK, false)).toBe(seen.at(-1));
      now = next;
      seen.push(dayPeriod(now, GDANSK, false));
    }
    expect(seen).toEqual(["night", "golden", "day", "golden", "night"]);
  });
});

describe("parseTimeOverride", () => {
  it.each(["day", "golden", "night"] as const)("akceptuje %s", (value) => {
    expect(parseTimeOverride(value)).toBe(value);
  });

  it("normalizuje i bierze pierwszą wartość", () => {
    expect(parseTimeOverride(" Night ")).toBe("night");
    expect(parseTimeOverride(["golden", "day"])).toBe("golden");
  });

  it.each([undefined, "", "noon", "__proto__"])("odrzuca %j", (value) => {
    expect(parseTimeOverride(value)).toBeNull();
  });
});
