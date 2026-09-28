import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER,
  parseWeatherOverride,
  SCENE_MEDIA,
  SCENES,
  toCssFilter,
  WEATHER_STATES,
  wmoToWeather,
} from "@/lib/scenes";

describe("wmoToWeather", () => {
  it.each([
    [0, "sunny"],
    [1, "sunny"],
    [2, "cloudy"],
    [3, "cloudy"],
    [45, "fog"],
    [48, "fog"],
    [51, "drizzle"],
    [57, "drizzle"],
    [61, "rain"],
    [67, "rain"],
    [80, "rain"],
    [82, "rain"],
    [71, "snow"],
    [77, "snow"],
    [85, "snow"],
    [86, "snow"],
    [95, "storm"],
    [99, "storm"],
  ] as const)("kod %i → %s", (code, expected) => {
    expect(wmoToWeather(code)).toBe(expected);
  });

  it.each([4, 44, 50, 58, 68, 79, 83, 87, 94, 100, -1])(
    "nieznany kod %i → neutralna scena",
    (code) => {
      expect(wmoToWeather(code)).toBe("cloudy");
    },
  );
});

describe("parseWeatherOverride", () => {
  it.each(WEATHER_STATES)("akceptuje %s", (state) => {
    expect(parseWeatherOverride(state)).toBe(state);
  });

  it("normalizuje wielkość liter i spacje", () => {
    expect(parseWeatherOverride(" Sunny ")).toBe("sunny");
  });

  it("bierze pierwszą wartość z powtórzonego parametru", () => {
    expect(parseWeatherOverride(["cloudy", "sunny"])).toBe("cloudy");
  });

  it.each([undefined, "", "hurricane", "__proto__"])("odrzuca %j", (value) => {
    expect(parseWeatherOverride(value)).toBeNull();
  });
});

describe("SCENES", () => {
  it("domyślna scena to deszcz", () => {
    expect(DEFAULT_WEATHER).toBe("rain");
  });

  it.each(WEATHER_STATES)("%s wskazuje istniejące nagranie", (state) => {
    const media = SCENE_MEDIA[SCENES[state].video];
    expect(media.video).toMatch(/^\/scenes\/[a-z-]+\/loop-720\.mp4$/);
    expect(media.poster).toMatch(/^\/scenes\/[a-z-]+\/poster\.jpg$/);
  });

  it("stany mapują się na nagrania zgodnie z §5", () => {
    expect(SCENES.fog.video).toBe("cloudy");
    expect(SCENES.snow.video).toBe("cloudy");
    expect(SCENES.drizzle.video).toBe("rain");
    expect(SCENES.storm.video).toBe("rain");
  });

  it("wartości startowe tokenów z §5", () => {
    expect(SCENES.rain.tokens.scrimStrength).toBe(0.15);
    expect(SCENES.storm.tokens.scrimStrength).toBe(0.1);
    expect(SCENES.cloudy.tokens.scrimStrength).toBe(0.2);
    expect(SCENES.fog.tokens.scrimStrength).toBe(0.2);
    expect(SCENES.sunny.tokens.scrimStrength).toBe(0.32);
    expect(toCssFilter(SCENES.storm.tokens.videoFilter)).toBe("brightness(0.72) saturate(0.9)");
    expect(toCssFilter(SCENES.sunny.tokens.videoFilter)).toBe("brightness(1) saturate(0.9)");
  });
});
