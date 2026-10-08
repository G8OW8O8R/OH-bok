import { describe, expect, it } from "vitest";
import { wmoToWeather, type WeatherState } from "@/lib/scenes";

/** Tabela kodów WMO → stan pogody, zapisana niezależnie od implementacji. */
const TABLE: ReadonlyArray<{ state: WeatherState; ranges: ReadonlyArray<readonly [number, number]> }> = [
  { state: "sunny", ranges: [[0, 1]] },
  { state: "cloudy", ranges: [[2, 3]] },
  { state: "fog", ranges: [[45, 45], [48, 48]] },
  { state: "drizzle", ranges: [[51, 57]] },
  { state: "rain", ranges: [[61, 67], [80, 82]] },
  { state: "snow", ranges: [[71, 77], [85, 86]] },
  { state: "storm", ranges: [[95, 99]] },
];

const expand = ([from, to]: readonly [number, number]) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("wmoToWeather: każdy kod z tabeli", () => {
  for (const { state, ranges } of TABLE) {
    for (const range of ranges) {
      it.each(expand(range))(`${range[0]}–${range[1]}: kod %i → ${state}`, (code) => {
        expect(wmoToWeather(code)).toBe(state);
      });
    }
  }
});

describe("wmoToWeather: kody spoza tabeli", () => {
  const mapped = new Set(TABLE.flatMap(({ ranges }) => ranges.flatMap(expand)));
  const unmapped = Array.from({ length: 100 }, (_, i) => i).filter((code) => !mapped.has(code));

  it("tabela zostawia luki (np. 4–44), więc test coś sprawdza", () => {
    expect(unmapped.length).toBeGreaterThan(50);
  });

  it.each(unmapped)("nieznany kod %i → neutralna scena (pochmurno)", (code) => {
    expect(wmoToWeather(code)).toBe("cloudy");
  });

  it.each([-1, 100, 255, 1.5, 61.2, Number.NaN, Number.POSITIVE_INFINITY])(
    "nieprawidłowa wartość %s → neutralna scena, bez wyjątku",
    (code) => {
      expect(wmoToWeather(code)).toBe("cloudy");
    },
  );
});
