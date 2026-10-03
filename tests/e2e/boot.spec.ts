import { expect, test, type Page } from "@playwright/test";

/**
 * Odchyłka znaczników JS (timery Boot, pierwsza klatka krzywej) od harmonogramu startu w e2e. Headless bez GPU,
 * często równolegle z innymi testami: pojedyncza klatka trwa 70–200 ms. Kryterium ±50 ms dla
 * rzeczywistego obrazu sprawdza pomiar w Chrome z GPU; tu: zaplanowane opóźnienia
 * animacji (dokładnie) i znaczniki JS (z zapasem na jedną wolną klatkę).
 */
const TOLERANCE = 250;

type BootWindow = {
  __delays: Record<string, number>;
  __durations: Record<string, number>;
  __heldBeforeGate: string[];
  __shifts: number[];
  __plan: string | null;
  /** Pudełka lecących kul i kuli docelowej w chwili końca przelotu. */
  __landing: { flying: DOMRect; orb: DOMRect } | null;
};

/** Zaplanowane opóźnienia animacji CSS/WAAPI, wstrzymanie do bramki i przesunięcia layoutu w trakcie startu. */
async function recordBoot(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as BootWindow;
    w.__delays = {};
    w.__durations = {};
    w.__heldBeforeGate = [];
    w.__shifts = [];
    w.__plan = null;
    w.__landing = null;
    // Plan zapisany przez skrypt w <head>; przy wolnym serwerze dev sekwencja potrafi się skończyć przed `load`.
    document.addEventListener("DOMContentLoaded", () => {
      w.__plan = document.documentElement.getAttribute("data-boot");
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__shifts.push(entry.startTime);
    }).observe({ type: "layout-shift", buffered: true });
    const grab = () => {
      const root = document.documentElement;
      for (const animation of document.getAnimations()) {
        if (!(animation.effect instanceof KeyframeEffect)) continue;
        const name = animation instanceof CSSAnimation ? animation.animationName : "flight";
        const target = animation.effect.target;
        const id = target instanceof HTMLElement ? (target.dataset.testid ?? target.className.split(" ")[0]) : "";
        const key = `${name}:${id}`;
        const timing = animation.effect.getTiming();
        w.__durations[key] = Number(timing.duration);
        // Ta sama animacja na wielu elementach (karty dni, refleks kody): liczy się pierwsza.
        w.__delays[key] = Math.min(w.__delays[key] ?? Infinity, Number(timing.delay ?? 0));
        if (!root.hasAttribute("data-boot-step") && animation.playState === "paused" && !w.__heldBeforeGate.includes(key)) {
          w.__heldBeforeGate.push(key);
        }
      }
      const flights = document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));
      if (!w.__landing && root.dataset.bootOrb === "landed" && flights.every((a) => a.playState === "finished")) {
        const flying = document.querySelector('[data-testid="boot-orb"]');
        const orb = document.querySelector('[data-testid="orb"]');
        if (flying && orb) w.__landing = { flying: flying.getBoundingClientRect(), orb: orb.getBoundingClientRect() };
      }
      if (root.hasAttribute("data-boot")) requestAnimationFrame(grab);
    };
    requestAnimationFrame(grab);
  });
}

async function bootReport(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as BootWindow;
    const mark = (name: string) => performance.getEntriesByName(`obok-boot:${name}`)[0]?.startTime ?? null;
    return {
      plan: w.__plan,
      landing: w.__landing && { flying: w.__landing.flying.toJSON() as DOMRect, orb: w.__landing.orb.toJSON() as DOMRect },
      delays: w.__delays,
      durations: w.__durations,
      held: w.__heldBeforeGate,
      shifts: w.__shifts,
      start: mark("start"),
      live: mark("live"),
      reveal: mark("reveal"),
      flight: mark("flight"),
      landed: mark("landed"),
      curve: mark("curve"),
      done: mark("done"),
      skip: mark("skip"),
    };
  });
}

test("pierwsza wizyta: kroki według tabeli, przelot kul do kuli „Obok”, bez skoków layoutu", async ({ page }) => {
  await recordBoot(page);
  await page.goto("/?weather=rain&boot=first&orb-mode=fallback");
  await expect(page.locator("html")).toHaveAttribute("data-boot", "first");
  await expect(page.getByTestId("boot")).toBeVisible();

  await expect(page.locator("html")).not.toHaveAttribute("data-boot", /.*/, { timeout: 10_000 });
  await expect(page.getByTestId("boot")).toHaveCount(0);
  const report = await bootReport(page);
  const { start, reveal } = report;
  expect(start).not.toBeNull();
  expect(reveal).not.toBeNull();
  if (start === null || reveal === null) return;

  // Kule lądują dokładnie na kuli pulpitu.
  const { landing } = report;
  expect(landing).not.toBeNull();
  if (landing) {
    expect(Math.abs(landing.flying.x - landing.orb.x)).toBeLessThan(2);
    expect(Math.abs(landing.flying.y - landing.orb.y)).toBeLessThan(2);
    expect(Math.abs(landing.flying.width - landing.orb.width)).toBeLessThan(2);
  }

  // Faza logo: opóźnienia od pierwszej klatki (czarny ekran = 0 ms).
  const planned = (key: string, ms: number) => expect(report.delays[key], key).toBeCloseTo(ms, 0);
  planned("boot-logo:boot-orb", 100);
  planned("boot-rise:boot-wordmark", 700);
  planned("boot-fade:boot-bar", 1100);

  // Bramka: nie przed 1600 ms; limit 2,5 s liczy się od startu, ale bez hydracji bramka nie ruszy
  // (wolny serwer dev pod obciążeniem: po hydracji jeszcze kilkaset ms na pierwszy timer).
  expect(reveal - start).toBeGreaterThanOrEqual(1600 - TOLERANCE);
  expect(reveal).toBeLessThanOrEqual(Math.max(start + 2500 + TOLERANCE, (report.live ?? 0) + 500));

  // Kroki pulpitu stoją do bramki, potem ruszają z opóźnieniem = czas z tabeli − 1600 ms.
  const afterGate = (key: string, at: number) => {
    expect(report.held, key).toContain(key);
    planned(key, at - 1600);
  };
  afterGate("boot-scene:scene", 1700);
  afterGate("boot-drop:desktop-chrome", 2300);
  afterGate("boot-l1:text-display", 2400);
  afterGate("boot-l1:brief", 2550);
  afterGate("boot-slide:shopping-list", 2700 + 60);
  afterGate("boot-pop:forecast-day", 2900);
  afterGate("boot-fade:dock", 3600);
  expect(report.delays["boot-sweep:glass-sweep"]).toBeGreaterThanOrEqual(3900 - 1600);
  expect(report.delays["boot-sweep:glass-sweep"]).toBeLessThanOrEqual(3900 + 200 - 1600);

  const markAt = (value: number | null, at: number, name: string) =>
    expect(Math.abs((value ?? Infinity) - reveal - (at - 1600)), name).toBeLessThanOrEqual(TOLERANCE);
  markAt(report.flight, 1700, "przelot");
  markAt(report.curve, 2900, "krzywa");
  markAt(report.landed, 2900, "przejęcie kuli");
  markAt(report.done, 4700, "koniec");

  // Żadnych przesunięć layoutu od odsłonięcia sceny.
  expect(report.shifts.filter((at) => at >= reveal)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("obok-boot"))).toBe("1");
});

test("pominięcie klawiszem: od razu stan końcowy; kolejna wizyta = wybudzenie ~800 ms", async ({ page }) => {
  await recordBoot(page);
  await page.goto("/?weather=rain&boot=first");
  await expect(page.locator("html")).toHaveAttribute("data-boot", "first");
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-boot-live"));
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).not.toHaveAttribute("data-boot", /.*/);
  await expect(page.getByTestId("boot")).toHaveCount(0);
  await expect(page.getByTestId("orb")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("dock")).toHaveCSS("opacity", "1");
  expect((await bootReport(page)).skip).not.toBeNull();

  await page.goto("/?weather=rain");
  await expect(page.locator("html")).not.toHaveAttribute("data-boot", /.*/, { timeout: 5000 });
  const { plan, start, done, durations } = await bootReport(page);
  expect(plan).toBe("wake");
  expect(durations["boot-logo:boot-orb"]).toBeUndefined();
  expect(start).not.toBeNull();
  expect((done ?? Infinity) - (start ?? 0)).toBeLessThanOrEqual(850 + TOLERANCE * 4);
});

test("reduced motion: bez logo i przelotu, jedno przenikanie ≤ 150 ms", async ({ page }) => {
  await recordBoot(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?weather=rain&boot=first");
  await expect(page.locator("html")).not.toHaveAttribute("data-boot", /.*/, { timeout: 5000 });
  const { plan, durations } = await bootReport(page);
  expect(plan).toBe("reduced");
  const boot = Object.entries(durations).filter(([key]) => key.startsWith("boot"));
  // Tylko jedno przenikanie całej strony (<main>), żadnych kroków choreografii.
  expect(boot.map(([key]) => key.split(":")[0])).toEqual(["boot-fade"]);
  for (const [, duration] of boot) expect(duration).toBeLessThanOrEqual(150);
  await expect(page.getByTestId("boot")).toHaveCount(0);
  await expect(page.locator("main")).toHaveCSS("opacity", "1");
});
