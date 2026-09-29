import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/open-meteo-gdansk.json";
import { createLastKnownStore } from "@/lib/weather/last-known";
import {
  buildForecastUrl,
  classifyAge,
  getWeather,
  WEATHER_REVALIDATE_S,
  type WeatherServiceDeps,
} from "@/lib/weather/service";

const NOW = new Date("2026-09-29T18:05:00Z");

function okResponse(dateHeader: Date): Response {
  return new Response(JSON.stringify(fixture), {
    status: 200,
    headers: { "content-type": "application/json", date: dateHeader.toUTCString() },
  });
}

function deps(fetchImpl: WeatherServiceDeps["fetch"], now = NOW): WeatherServiceDeps {
  return { fetch: fetchImpl, now: () => now, lastKnown: createLastKnownStore() };
}

describe("buildForecastUrl", () => {
  it("używa zaokrąglonych współrzędnych i potrzebnych zmiennych", () => {
    const url = new URL(buildForecastUrl({ lat: 54.35249, lon: 18.64637 }));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("54.35");
    expect(url.searchParams.get("longitude")).toBe("18.65");
    expect(url.searchParams.get("forecast_days")).toBe("5");
    expect(url.searchParams.get("current")).toContain("precipitation");
    expect(url.searchParams.get("daily")).toContain("sunrise");
  });
});

describe("classifyAge", () => {
  it.each([
    [-800, "miss"], // Date po starcie zapytania (różnica zegarów)
    [0, "miss"],
    [1000, "miss"], // Date zaokrąglony w dół do pełnej sekundy
    [5000, "hit"], // wpis z cache sprzed kilku sekund
    [60_000, "hit"],
    [WEATHER_REVALIDATE_S * 1000 - 1, "hit"],
    [WEATHER_REVALIDATE_S * 1000, "stale"],
  ] as const)("%i ms → %s", (age, expected) => {
    expect(classifyAge(age)).toBe(expected);
  });
});

describe("getWeather", () => {
  it("prosi o cache danych Next.js na 30 min", async () => {
    const fetchMock = vi.fn<WeatherServiceDeps["fetch"]>().mockResolvedValue(okResponse(NOW));
    await getWeather(null, deps(fetchMock));
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.next).toEqual({ revalidate: 1800, tags: ["weather"] });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("świeżo pobrane: miss, live, Gdańsk jako domyślny", async () => {
    const result = await getWeather(null, deps(async () => okResponse(NOW)));
    expect(result).toMatchObject({ cache: "miss", provider: "open-meteo" });
    expect(result.data.source).toBe("live");
    expect(result.data.location).toEqual({ lat: 54.35, lon: 18.65, isDefault: true });
  });

  it("odpowiedź z cache danych młodsza niż 30 min: hit", async () => {
    const result = await getWeather(null, deps(async () => okResponse(new Date(NOW.getTime() - 10 * 60_000))));
    expect(result.cache).toBe("hit");
    expect(result.data.source).toBe("live");
  });

  it("odpowiedź z cache danych starsza niż 30 min (Open-Meteo nie odświeżyło): stale", async () => {
    const result = await getWeather(null, deps(async () => okResponse(new Date(NOW.getTime() - 3 * 3600_000))));
    expect(result.cache).toBe("stale");
    expect(result.data.source).toBe("cache");
  });

  it("awaria Open-Meteo, dane w pamięci instancji: stale", async () => {
    const shared = deps(async () => okResponse(NOW));
    await getWeather({ lat: 52.23, lon: 21.01 }, shared);
    const result = await getWeather(
      { lat: 52.231, lon: 21.012 },
      { ...shared, fetch: async () => Promise.reject(new TypeError("fetch failed")), onUpstreamError: () => {} },
    );
    expect(result).toMatchObject({ cache: "stale", provider: "open-meteo" });
    expect(result.data.source).toBe("cache");
    expect(result.data.location.isDefault).toBe(false);
  });

  it.each([
    ["błąd sieci", async () => Promise.reject(new TypeError("fetch failed"))],
    ["HTTP 429", async () => new Response("{}", { status: 429 })],
    ["zła odpowiedź", async () => new Response(JSON.stringify({ error: true }), { status: 200 })],
    ["timeout", async () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
  ] as const)("%s bez żadnego cache: demo, bez wyjątku", async (_label, fetchImpl) => {
    const onUpstreamError = vi.fn();
    const result = await getWeather(null, { ...deps(fetchImpl), onUpstreamError });
    expect(result).toMatchObject({ cache: "demo", provider: "demo" });
    expect(result.data.source).toBe("demo");
    expect(onUpstreamError).toHaveBeenCalledOnce();
  });
});
