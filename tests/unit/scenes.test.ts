import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER,
  NEUTRAL_TINT,
  parseWeatherOverride,
  resolveScene,
  SCENE_MEDIA,
  SCENES,
  toCssFilter,
  WEATHER_STATES,
  weatherLabel,
} from "@/lib/scenes";

describe("weatherLabel", () => {
  it("nazywa stany po polsku", () => {
    expect(weatherLabel("rain", true)).toBe("Deszcz");
    expect(weatherLabel("storm", false)).toBe("Burza");
  });

  it("słońce w nocy = bezchmurnie", () => {
    expect(weatherLabel("sunny", true)).toBe("Słonecznie");
    expect(weatherLabel("sunny", false)).toBe("Bezchmurnie");
  });
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
    expect(media.video).toMatch(/^\/scenes\/[a-z-]+\/loop-1080\.mp4$/);
    expect(media.poster).toMatch(/^\/scenes\/[a-z-]+\/poster\.jpg$/);
  });

  it("stany mapują się na nagrania zgodnie z tabelą stanów", () => {
    expect(SCENES.fog.video).toBe("cloudy");
    expect(SCENES.snow.video).toBe("cloudy");
    expect(SCENES.drizzle.video).toBe("rain");
    expect(SCENES.storm.video).toBe("rain");
  });

  it("wartości startowe tokenów sceny", () => {
    expect(SCENES.rain.tokens.scrimStrength).toBe(0.15);
    expect(SCENES.storm.tokens.scrimStrength).toBe(0.1);
    expect(SCENES.cloudy.tokens.scrimStrength).toBe(0.2);
    expect(SCENES.fog.tokens.scrimStrength).toBe(0.2);
    expect(SCENES.sunny.tokens.scrimStrength).toBe(0.32);
    expect(toCssFilter(SCENES.storm.tokens.videoFilter)).toBe("brightness(0.72) saturate(0.9)");
    expect(toCssFilter(SCENES.sunny.tokens.videoFilter)).toBe("brightness(1) saturate(0.9)");
  });

  it.each(WEATHER_STATES)("%s: siły winiet w zakresie 0–1", (state) => {
    const { scrimStrength, haloStrength, vignetteStrength } = SCENES[state].tokens;
    for (const value of [scrimStrength, haloStrength, vignetteStrength]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("jasne niebo ma mocniejsze halo i ciemniejsze szkło niż deszcz (pomiar kontrastu)", () => {
    for (const state of ["cloudy", "fog", "snow"] as const) {
      expect(SCENES[state].tokens.haloStrength).toBeGreaterThan(SCENES.rain.tokens.haloStrength);
      expect(SCENES[state].tokens.glassTint).toBe("rgba(14, 16, 20, 0.58)");
      expect(SCENES[state].tokens.glassBlur).toBeLessThanOrEqual(40);
    }
  });
});

describe("resolveScene (pogoda × pora dnia)", () => {
  it("plansze według tabeli pór", () => {
    const table = Object.fromEntries(
      WEATHER_STATES.map((state) => [
        state,
        (["day", "golden", "night"] as const).map((period) => resolveScene(state, period).video).join(" / "),
      ]),
    );
    expect(table).toEqual({
      sunny: "sunny / sunny / night-clear",
      cloudy: "cloudy / cloudy / night-cloudy",
      fog: "cloudy / cloudy / night-cloudy",
      snow: "cloudy / cloudy / night-cloudy",
      drizzle: "rain / rain / rain",
      rain: "rain / rain / rain",
      storm: "rain / rain / rain",
    });
  });

  it.each(["night-clear", "night-cloudy"] as const)("plansza nocna %s ma pliki", (video) => {
    expect(SCENE_MEDIA[video]).toEqual({
      video: `/scenes/${video}/loop-1080.mp4`,
      videoAv1: `/scenes/${video}/loop-1080.av1.mp4`,
      poster: `/scenes/${video}/poster.jpg`,
      posterAvif: `/scenes/${video}/poster.avif`,
      posterWebp: `/scenes/${video}/poster.webp`,
    });
  });

  it("dzień to sceny bazowe; ta sama referencja przy każdym wywołaniu", () => {
    for (const state of WEATHER_STATES) {
      expect(resolveScene(state, "day")).toBe(SCENES[state]);
      expect(resolveScene(state, "night")).toBe(resolveScene(state, "night"));
      expect(SCENES[state].tokens.warmth).toBe(0);
      expect(SCENES[state].tokens.tint).toEqual(NEUTRAL_TINT);
    }
  });

  it("złota godzina: plansza dzienna, ciepły gradient, słońce najcieplejsze", () => {
    for (const state of WEATHER_STATES) {
      const golden = resolveScene(state, "golden");
      expect(golden.video).toBe(SCENES[state].video);
      expect(golden.tokens.warmth).toBeGreaterThan(0);
      expect(golden.tokens.warmth).toBeLessThanOrEqual(resolveScene("sunny", "golden").tokens.warmth);
      expect(golden.tokens.tint).toEqual(NEUTRAL_TINT);
    }
  });

  it("noc na planszy deszczu: ciemniejszy i chłodniejszy grading niż w dzień", () => {
    for (const state of ["drizzle", "rain", "storm"] as const) {
      const night = resolveScene(state, "night").tokens;
      expect(night.videoFilter.brightness).toBeLessThan(SCENES[state].tokens.videoFilter.brightness);
      expect(night.tint[0]).toBeLessThan(night.tint[2]);
      expect(night.warmth).toBe(0);
    }
  });

  it("tokeny nocne i złotej godziny w zakresach", () => {
    for (const state of WEATHER_STATES) {
      for (const period of ["golden", "night"] as const) {
        const { scrimStrength, haloStrength, vignetteStrength, tint, warmth, glassBlur } = resolveScene(state, period).tokens;
        for (const value of [scrimStrength, haloStrength, vignetteStrength, warmth, ...tint]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(glassBlur).toBeLessThanOrEqual(40);
      }
    }
  });
});
