import { describe, expect, it } from "vitest";
import fixture from "../fixtures/open-meteo-gdansk.json";
import { isWorthKeeping, LOCAL_CACHE_MAX_AGE_MS, resolveClientWeather } from "@/lib/weather/client-fallback";
import {
  coordsKey,
  coordsQuerySchema,
  GDANSK,
  parseLocationCookie,
  roundCoords,
  serializeLocationCookie,
} from "@/lib/weather/coords";
import { demoWeather } from "@/lib/weather/demo";
import { createLastKnownStore } from "@/lib/weather/last-known";
import { formatUtcOffset, localToIso, normalizeOpenMeteo, toMmPerHour } from "@/lib/weather/normalize";
import { openMeteoResponseSchema, weatherDataSchema, type WeatherData } from "@/lib/weather/schema";

const NOW = new Date("2026-09-29T18:05:00Z");

function liveData(fetchedAt = NOW): WeatherData {
  return normalizeOpenMeteo(openMeteoResponseSchema.parse(fixture), {
    location: GDANSK,
    isDefault: true,
    fetchedAt,
    source: "live",
  });
}

describe("coords", () => {
  it("zaokrągla do 0,01° i usuwa -0", () => {
    expect(roundCoords({ lat: 54.35249, lon: 18.64637 })).toEqual({ lat: 54.35, lon: 18.65 });
    expect(Object.is(roundCoords({ lat: -0.001, lon: 0 }).lat, 0)).toBe(true);
  });

  it("sąsiednie punkty dzielą klucz cache", () => {
    expect(coordsKey({ lat: 54.3521, lon: 18.6462 })).toBe(coordsKey({ lat: 54.3479, lon: 18.6538 }));
  });

  it.each([
    ["54.35", "18.65", true],
    ["-90", "180", true],
    ["90.1", "0", false],
    ["0", "-180.5", false],
    ["abc", "18", false],
    ["", "18", false],
    ["1e2", "0", false],
  ])("lat=%s lon=%s → poprawne: %s", (lat, lon, ok) => {
    expect(coordsQuerySchema.safeParse({ lat, lon }).success).toBe(ok);
  });

  it("ciasteczko lokalizacji: zapis i odczyt, śmieci = brak lokalizacji", () => {
    const value = serializeLocationCookie({ lat: 52.2297, lon: 21.0122 });
    expect(value).toBe("52.23,21.01");
    expect(parseLocationCookie(value)).toEqual({ lat: 52.23, lon: 21.01 });
    expect(parseLocationCookie("999,1")).toBeNull();
    expect(parseLocationCookie("<script>")).toBeNull();
    expect(parseLocationCookie(undefined)).toBeNull();
  });
});

describe("normalize", () => {
  it("formatuje przesunięcie strefy", () => {
    expect(formatUtcOffset(7200)).toBe("+02:00");
    expect(formatUtcOffset(-12600)).toBe("-03:30");
    expect(formatUtcOffset(0)).toBe("+00:00");
  });

  it("czas lokalny Open-Meteo → ISO ze strefą", () => {
    expect(localToIso("2026-09-29T06:43", 7200)).toBe("2026-09-29T06:43:00+02:00");
  });

  it("opad z okna 15 min → mm/h", () => {
    expect(toMmPerHour(0.5, 900)).toBe(2);
    expect(toMmPerHour(0, 900)).toBe(0);
    expect(toMmPerHour(1.2, 3600)).toBe(1.2);
  });

  it("prawdziwa odpowiedź Open-Meteo daje poprawny WeatherData", () => {
    const data = liveData();
    expect(weatherDataSchema.safeParse(data).success).toBe(true);
    expect(data.current).toMatchObject({
      weatherCode: 2,
      state: "cloudy",
      temperatureC: 14.3,
      isDay: false,
      precipitationMmH: 0,
      time: "2026-09-29T20:00:00+02:00",
    });
    expect(data.daily).toHaveLength(5);
    expect(data.daily[0]).toMatchObject({
      date: "2026-09-29",
      state: "cloudy",
      sunrise: "2026-09-29T06:43:00+02:00",
      sunset: "2026-09-29T18:26:00+02:00",
    });
  });

  it("brak wschodu (noc polarna) i brak kodu dnia nie psują normalizacji", () => {
    const raw = openMeteoResponseSchema.parse({
      ...fixture,
      daily: { ...fixture.daily, sunrise: [null, ...fixture.daily.sunrise.slice(1)], weather_code: [null, 3, 3, 3, 3] },
    });
    const data = normalizeOpenMeteo(raw, { location: GDANSK, isDefault: true, fetchedAt: NOW, source: "live" });
    expect(data.daily[0]?.sunrise).toBeNull();
    expect(data.daily[0]?.state).toBe("cloudy");
    expect(weatherDataSchema.safeParse(data).success).toBe(true);
  });

  it("odrzuca odpowiedź bez wymaganych pól", () => {
    expect(openMeteoResponseSchema.safeParse({ ...fixture, current: undefined }).success).toBe(false);
    expect(openMeteoResponseSchema.safeParse({ error: true, reason: "Rate limit" }).success).toBe(false);
  });
});

describe("demoWeather", () => {
  it("jest poprawne, oznaczone jako demo i ma 5 dni", () => {
    const demo = demoWeather(NOW);
    expect(weatherDataSchema.safeParse(demo).success).toBe(true);
    expect(demo.source).toBe("demo");
    expect(demo.location.isDefault).toBe(true);
    expect(demo.daily).toHaveLength(5);
    expect(demo.daily[0]?.date).toBe("2026-09-29");
  });

  it("zachowuje lokalizację, o którą proszono", () => {
    expect(demoWeather(NOW, { lat: 52.23, lon: 21.01 }).location).toEqual({ lat: 52.23, lon: 21.01, isDefault: false });
  });
});

describe("createLastKnownStore", () => {
  it("zwraca ostatnie dane do 24 h, potem zapomina", () => {
    const store = createLastKnownStore();
    store.set("k", liveData());
    expect(store.get("k", new Date(NOW.getTime() + 60_000))).not.toBeNull();
    expect(store.get("k", new Date(NOW.getTime() + 25 * 3600_000))).toBeNull();
  });

  it("ma limit wpisów (najstarszy wypada)", () => {
    const store = createLastKnownStore(2);
    store.set("a", liveData());
    store.set("b", liveData());
    store.set("c", liveData());
    expect(store.get("a", NOW)).toBeNull();
    expect(store.get("c", NOW)).not.toBeNull();
  });
});

describe("resolveClientWeather", () => {
  const lastGood = liveData(new Date(NOW.getTime() - 2 * 3600_000));

  it("dane z serwera mają pierwszeństwo", () => {
    const fetched = liveData();
    expect(resolveClientWeather({ fetched, lastGood, now: NOW })).toBe(fetched);
  });

  it("brak sieci: lokalna kopia oznaczona jako cache", () => {
    const result = resolveClientWeather({ fetched: null, lastGood, now: NOW });
    expect(result.source).toBe("cache");
    expect(result.fetchedAt).toBe(lastGood.fetchedAt);
  });

  it("serwer zwrócił demo, a lokalna kopia jest: lepsza kopia", () => {
    const result = resolveClientWeather({ fetched: demoWeather(NOW), lastGood, now: NOW });
    expect(result.source).toBe("cache");
  });

  it("brak sieci i brak kopii: demo", () => {
    expect(resolveClientWeather({ fetched: null, lastGood: null, now: NOW }).source).toBe("demo");
  });

  it("kopia starsza niż 24 h nie jest używana", () => {
    const old = liveData(new Date(NOW.getTime() - LOCAL_CACHE_MAX_AGE_MS - 1));
    expect(resolveClientWeather({ fetched: null, lastGood: old, now: NOW }).source).toBe("demo");
  });

  it("demo nie jest zapisywane jako „ostatnie dobre”", () => {
    expect(isWorthKeeping(demoWeather(NOW))).toBe(false);
    expect(isWorthKeeping(liveData())).toBe(true);
  });
});
