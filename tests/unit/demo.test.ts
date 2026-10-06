import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInfo, STORED_DATA } from "@/lib/about";
import { BOOT_STORAGE_KEY } from "@/lib/boot";
import { parseCommand } from "@/lib/commands/parse";
import { searchApps } from "@/lib/commands/search";
import { isDemoSearch } from "@/lib/demo/mode";
import { DEMO_COMMAND, DEMO_LOOP_MS, demoFrame, demoScript, nextDemoChange } from "@/lib/demo/script";
import { appStorage, setStorageMode, storageMode } from "@/lib/storage";
import { LOCATION_COOKIE } from "@/lib/weather/coords";
import { APPS, appFromSlug, openerElementId } from "@/lib/windows/apps";

describe("scenariusz demo", () => {
  const steps = demoScript(false);

  it("kroki posortowane, mieszczą się w pętli 60–90 s", () => {
    const times = steps.map((step) => step.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(DEMO_LOOP_MS).toBeGreaterThanOrEqual(60_000);
    expect(DEMO_LOOP_MS).toBeLessThanOrEqual(90_000);
    expect(times.at(-1)).toBeLessThan(DEMO_LOOP_MS);
  });

  it("przechodzi przez słońce, złotą godzinę, noc, deszcz i burzę", () => {
    const scenes = steps.flatMap((step) => (step.kind === "scene" ? [`${step.weather}/${step.time}`] : []));
    expect(scenes).toEqual(expect.arrayContaining(["sunny/day", "sunny/golden", "sunny/night", "rain/day", "storm/day"]));
  });

  it("klatka: scena, podgląd, Spotlight, okna", () => {
    expect(demoFrame(steps, 0)).toMatchObject({ loop: 0, weather: "sunny", time: "day", spotlight: false, window: null });
    expect(demoFrame(steps, 8_000)).toMatchObject({ weather: "sunny", time: "golden" });
    expect(demoFrame(steps, 30_000)).toMatchObject({ weather: "storm" });
    expect(demoFrame(steps, 40_000).previewDay).toBe(1);
    expect(demoFrame(steps, 45_000).previewDay).toBeNull();
    expect(demoFrame(steps, 56_000).window).toBe("markets");
    expect(demoFrame(steps, 64_000).window).toBe("news");
    expect(demoFrame(steps, 72_000).window).toBeNull();
  });

  it("wpisywanie znak po znaku, Enter, zamknięcie czyści pole", () => {
    expect(demoFrame(steps, 47_000)).toMatchObject({ spotlight: true, typed: "", submitted: false });
    expect(demoFrame(steps, 47_200).typed).toBe(DEMO_COMMAND.slice(0, 1));
    expect(demoFrame(steps, 47_200 + 55 * 4).typed).toBe(DEMO_COMMAND.slice(0, 5));
    expect(demoFrame(steps, 49_900).typed).toBe(DEMO_COMMAND);
    expect(demoFrame(steps, 50_100)).toMatchObject({ submitted: true, typed: DEMO_COMMAND });
    expect(demoFrame(steps, 54_000)).toMatchObject({ spotlight: false, typed: "", submitted: false });
  });

  it("pętla: kolejne okrążenie od początku", () => {
    expect(demoFrame(steps, DEMO_LOOP_MS + 8_000)).toMatchObject({ loop: 1, time: "golden" });
  });

  it("następna zmiana: kolejny krok albo kolejny znak", () => {
    expect(nextDemoChange(steps, 0)).toBe(7_000);
    expect(nextDemoChange(steps, 47_300)).toBe(47_200 + 2 * 55);
    expect(nextDemoChange(steps, 72_000)).toBe(DEMO_LOOP_MS);
    expect(nextDemoChange(steps, DEMO_LOOP_MS + 100)).toBe(DEMO_LOOP_MS + 7_000);
  });

  it("reduced motion: bez podglądu dni w kuli", () => {
    const reduced = demoScript(true);
    expect(reduced.some((step) => step.kind === "preview")).toBe(false);
    expect(reduced.some((step) => step.kind === "scene" && step.weather === "storm")).toBe(true);
  });

  it("parametr ?demo=1", () => {
    expect(isDemoSearch("?demo=1")).toBe(true);
    expect(isDemoSearch("?weather=rain&demo=1")).toBe(true);
    expect(isDemoSearch("?demo=0")).toBe(false);
    expect(isDemoSearch("")).toBe(false);
  });
});

describe("zapis w trybie demo", () => {
  const local = new Map<string, string>();

  afterEach(() => {
    setStorageMode("local");
    local.clear();
    vi.unstubAllGlobals();
  });

  it("w pamięci localStorage zostaje nietknięty; wyjście czyści pamięć", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => void local.set(key, value),
      removeItem: (key: string) => void local.delete(key),
    });
    local.set("obok-shopping", "user");
    setStorageMode("memory");
    expect(storageMode()).toBe("memory");
    expect(appStorage.getItem("obok-shopping")).toBeNull();
    void appStorage.setItem("obok-shopping", "demo");
    expect(appStorage.getItem("obok-shopping")).toBe("demo");
    expect(local.get("obok-shopping")).toBe("user");
    setStorageMode("local");
    expect(appStorage.getItem("obok-shopping")).toBe("user");
    setStorageMode("memory");
    expect(appStorage.getItem("obok-shopping")).toBeNull();
  });
});

describe("okno „O systemie”", () => {
  it("adres, komenda i wyszukiwanie", () => {
    expect(appFromSlug("o-systemie")).toBe("about");
    expect(APPS.about.dock).toBe(false);
    expect(openerElementId("about")).toBe("logo-button");
    expect(openerElementId("markets")).toBe("dock-markets");
    const ctx = { now: new Date("2026-10-06T10:00:00+02:00"), timeZone: "Europe/Warsaw" };
    expect(parseCommand("o systemie", ctx)).toEqual({ kind: "openApp", app: "about" });
    expect(parseCommand("otwórz informacje o systemie", ctx)).toEqual({ kind: "openApp", app: "about" });
    expect(searchApps("prywatn")).toContain("about");
  });

  it("lista zapisanych danych obejmuje ciasteczko i wszystkie klucze", () => {
    const keys = STORED_DATA.map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining([LOCATION_COOKIE, BOOT_STORAGE_KEY, "obok-weather", "obok-shopping", "obok-reminders", "obok-alerts", "obok-markets", "obok-windows"]),
    );
    expect(STORED_DATA.find((item) => item.key === LOCATION_COOKIE)?.where).toBe("ciasteczko");
  });

  it("wersja: commit z Vercela albo „lokalnie”", () => {
    expect(buildInfo({})).toEqual({ commit: null, builtAt: null, href: null });
    expect(buildInfo({ commit: "", builtAt: "" }).commit).toBeNull();
    const info = buildInfo({ commit: "a5d324e9f00b", builtAt: "2026-10-06T10:00:00.000Z", repo: "https://github.com/x/y" });
    expect(info.commit).toBe("a5d324e");
    expect(info.builtAt?.toISOString()).toBe("2026-10-06T10:00:00.000Z");
    expect(info.href).toBe("https://github.com/x/y/commit/a5d324e9f00b");
    expect(buildInfo({ commit: "nie-hash" }).commit).toBeNull();
  });
});
