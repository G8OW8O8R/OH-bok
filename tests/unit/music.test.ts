import { describe, expect, it } from "vitest";
import { DAY_PERIODS } from "@/lib/day-period";
import { MOOD_PROFILES, musicMood } from "@/lib/music/mood";
import { WEATHER_STATES } from "@/lib/scenes";

describe("nastrój muzyki z pogody i pory dnia", () => {
  it("deszcz, mżawka i burza w dzień → lo-fi na deszcz", () => {
    for (const weather of ["rain", "drizzle", "storm"] as const) {
      expect(musicMood({ weather, period: "day" })).toBe("rain");
    }
    expect(MOOD_PROFILES.rain.queries).toEqual(expect.arrayContaining(["lofi", "ambient"]));
  });

  it("noc wygrywa z każdą pogodą → ambient, lo-fi", () => {
    for (const weather of WEATHER_STATES) expect(musicMood({ weather, period: "night" })).toBe("night");
    expect(MOOD_PROFILES.night.queries).toEqual(expect.arrayContaining(["ambient", "lofi"]));
  });

  it("słońce w dzień → chill, acoustic", () => {
    expect(musicMood({ weather: "sunny", period: "day" })).toBe("sunny");
    expect(MOOD_PROFILES.sunny.queries).toEqual(expect.arrayContaining(["chill", "acoustic"]));
  });

  it("złota godzina przy suchej pogodzie, deszcz o zachodzie zostaje deszczem", () => {
    expect(musicMood({ weather: "sunny", period: "golden" })).toBe("golden");
    expect(musicMood({ weather: "cloudy", period: "golden" })).toBe("golden");
    expect(musicMood({ weather: "rain", period: "golden" })).toBe("rain");
  });

  it("chmury w dzień, śnieg i mgła", () => {
    expect(musicMood({ weather: "cloudy", period: "day" })).toBe("cloudy");
    expect(musicMood({ weather: "snow", period: "day" })).toBe("snow");
    expect(musicMood({ weather: "fog", period: "golden" })).toBe("snow");
  });

  it("„coś spokojnego” ma pierwszeństwo przed pogodą i porą", () => {
    for (const weather of WEATHER_STATES) {
      for (const period of DAY_PERIODS) expect(musicMood({ weather, period, calm: true })).toBe("calm");
    }
  });

  it("każdy nastrój ma podpis i co najmniej dwie frazy wyszukiwania", () => {
    for (const profile of Object.values(MOOD_PROFILES)) {
      expect(profile.label.length).toBeGreaterThan(0);
      expect(profile.queries.length).toBeGreaterThanOrEqual(2);
    }
  });
});
