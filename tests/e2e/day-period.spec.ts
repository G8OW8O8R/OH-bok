import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const layerNames = (page: Page) =>
  page
    .getByTestId("weather-layers")
    .locator(":scope > [data-layer]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-layer")).sort());

/** ?weather= × ?time= → plansza i warstwy. */
const CASES: ReadonlyArray<{ weather: string; time: string; video: string; folder: string; layers: string[] }> = [
  { weather: "sunny", time: "golden", video: "sunny", folder: "sunny-lighthouse", layers: ["motes"] },
  { weather: "sunny", time: "night", video: "night-clear", folder: "night-clear", layers: [] },
  { weather: "cloudy", time: "night", video: "night-cloudy", folder: "night-cloudy", layers: [] },
  { weather: "fog", time: "night", video: "night-cloudy", folder: "night-cloudy", layers: ["fog"] },
  { weather: "snow", time: "night", video: "night-cloudy", folder: "night-cloudy", layers: ["precipitation"] },
  { weather: "rain", time: "night", video: "rain", folder: "rain-lighthouse", layers: ["beam", "precipitation"] },
  { weather: "storm", time: "golden", video: "rain", folder: "rain-lighthouse", layers: ["beam", "lightning", "precipitation"] },
];

test("?time= razem z ?weather= wybiera planszę, grading i warstwy", async ({ page }) => {
  // Dziewięć przeładowań strony w jednym teście.
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  for (const { weather, time, video, folder, layers } of CASES) {
    await page.goto(`/?boot=off&weather=${weather}&time=${time}`);
    const scene = page.getByTestId("scene");
    await expect(scene).toHaveAttribute("data-period", time);
    await expect(page.locator("[data-testid=scene-layer]")).toHaveAttribute("data-video", video);
    await expect(page.locator("[data-testid=scene-layer] img")).toHaveAttribute("src", `/scenes/${folder}/poster.jpg`);
    expect(await layerNames(page), `${weather} × ${time}`).toEqual(layers);
    if (layers.includes("motes")) {
      await expect(page.getByTestId("motes-layer")).toHaveAttribute("data-warm", "true");
    }
  }

  // Grading: złota godzina = ciepły gradient pod filtrem; noc na planszy deszczu = ciemniej i chłodniej.
  await page.goto("/?boot=off&weather=sunny&time=golden");
  await expect.poll(() => page.locator(".scene-golden-warm").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await page.goto("/?boot=off&weather=rain&time=night");
  await expect(page.getByTestId("scene-tint")).toHaveCSS("opacity", "1");
  expect(await page.locator(".scene-golden-warm").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  expect(await page.getByTestId("scene-tint").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(219, 235, 255)");
  expect(await page.getByTestId("scene-tint").evaluate((el) => getComputedStyle(el.parentElement!).filter)).toBe(
    "brightness(0.62) saturate(0.8)",
  );
  expect(errors).toEqual([]);
});

test("przypięty dzień z prognozy pokazuje wersję dzienną", async ({ page }) => {
  await page.goto("/?boot=off&weather=sunny&time=night");
  await expect(page.locator("[data-testid=scene-layer]")).toHaveAttribute("data-video", "night-clear");
  await page.getByTestId("forecast-day").nth(1).click();
  await expect(page.getByTestId("scene")).toHaveAttribute("data-period", "day");
  await expect(page.locator("[data-testid=scene-layer]")).toHaveCount(1, { timeout: 8000 });
  await expect(page.locator("[data-testid=scene-layer]")).not.toHaveAttribute("data-video", /^night-/);
  // Powrót do dziś = znowu noc (zwykłe przejście, akcja użytkownika).
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("scene")).toHaveAttribute("data-period", "night");
});

test("zmiana pory z zegara: dzień → noc, wolne przenikanie ok. 15 s, jedno nowe wideo", async ({ page }) => {
  const errors = collectErrors(page);
  const nightRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/scenes/night-clear/poster.jpg")) nightRequests.push(request.url());
  });
  test.setTimeout(120_000);
  await page.clock.install();
  // Kula CSS: przy przyspieszonym zegarze każda klatka WebGL (programowo w headless) kosztuje.
  await page.goto("/?boot=off&weather=sunny&orb-mode=fallback");
  const scene = page.getByTestId("scene");
  const layers = page.locator("[data-testid=scene-layer]");

  const jumpTo = async (target: number) => {
    const now = await page.evaluate(() => Date.now());
    await page.clock.fastForward(Math.max(0, target - now));
  };
  const periodEnds = async () => Date.parse((await scene.getAttribute("data-period-ends")) ?? "");

  // Start w dzień (test działa o każdej porze): przeskok do kolejnych granic aż do dnia.
  for (let i = 0; i < 4 && (await scene.getAttribute("data-period")) !== "day"; i++) {
    const ends = await periodEnds();
    await jumpTo(ends + 1000);
    await expect(scene).not.toHaveAttribute("data-period-ends", new Date(ends).toISOString());
  }
  await expect(scene).toHaveAttribute("data-period", "day");
  for (let i = 0; i < 3 && (await layers.count()) > 1; i++) await page.clock.runFor(16_000);
  await expect(layers).toHaveCount(1);
  await expect(layers.first()).toHaveAttribute("data-video", "sunny");
  nightRequests.length = 0;

  // Koniec dnia = zachód − 45 min; noc zaczyna się 90 min później (po złotej godzinie).
  await jumpTo((await periodEnds()) + 90 * 60_000 + 2000);
  await expect(scene).toHaveAttribute("data-period", "night");
  await expect(layers).toHaveCount(2);
  const incoming = layers.nth(1);
  await expect(incoming).toHaveAttribute("data-video", "night-clear");
  await expect(incoming).toHaveAttribute("data-ready", "true", { timeout: 10_000 });

  // Po 7 s przenikanie wciąż trwa (przy 1,4 s byłoby dawno po wszystkim)…
  await page.clock.runFor(7000);
  const midway = Number(await incoming.evaluate((el) => getComputedStyle(el).opacity));
  expect(midway).toBeGreaterThan(0.15);
  expect(midway).toBeLessThan(0.85);
  await expect(layers).toHaveCount(2);

  // …a po 15 s zostaje sama plansza nocna, bez skoku i bez drugiego ładowania.
  await page.clock.runFor(9000);
  await expect(layers).toHaveCount(1);
  await expect(layers.first()).toHaveAttribute("data-video", "night-clear");
  await expect(page.locator("[data-testid=scene-layer] video")).toHaveCount(1);
  // Poster nocny pobrany najwyżej raz (przy starcie nocą mógł przyjść z cache).
  expect(nightRequests.length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
