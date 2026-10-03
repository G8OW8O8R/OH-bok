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

/** Zestaw warstw z tabeli stanów pogody (w dzień; pora dnia: day-period.spec.ts). */
const EXPECTED: Record<string, string[]> = {
  sunny: ["motes"],
  cloudy: [],
  fog: ["fog"],
  drizzle: ["precipitation"],
  rain: ["beam", "precipitation"],
  snow: ["precipitation"],
  storm: ["beam", "lightning", "precipitation"],
};

test("każdy ?weather= pokazuje swój zestaw warstw", async ({ page }) => {
  const errors = collectErrors(page);
  for (const [weather, layers] of Object.entries(EXPECTED)) {
    await page.goto(`/?boot=off&weather=${weather}&time=day`);
    await expect(page.getByTestId("weather-layers")).toHaveAttribute("data-state", weather);
    expect(await layerNames(page), weather).toEqual(layers);
    if (layers.includes("precipitation")) {
      const kind = weather === "snow" ? "snow" : "rain";
      await expect(page.getByTestId("precipitation-layer")).toHaveAttribute("data-kind", kind);
      await expect(page.getByTestId("precipitation-layer")).toHaveAttribute("data-running", "true");
    }
    if (weather === "storm") await expect(page.getByTestId("lightning-bolt")).toHaveCount(3);
  }
  expect(errors).toEqual([]);
});

for (const [label, width, height] of [
  ["16:9", 1920, 1080],
  ["21:9", 2520, 1080],
  ["4:3", 1440, 1080],
] as const) {
  test(`piorun w pudełku kadru wideo, horyzont w kadrze (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?boot=off&weather=storm&time=day");
    const bolt = page.getByTestId("lightning-bolt").first();
    const video = page.locator("[data-testid=scene-layer] video").first();
    await expect(bolt).toHaveCount(1);
    const [b, v] = await Promise.all([bolt.boundingBox(), video.boundingBox()]);
    expect(b && v).toBeTruthy();
    if (!b || !v) return;
    for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(b[key] - v[key]), key).toBeLessThanOrEqual(0.5);
    // Piorun kończy się na horyzoncie (~48,7% klatki): ten punkt musi być na ekranie.
    const horizon = b.y + b.height * 0.487;
    expect(horizon).toBeGreaterThan(0);
    expect(horizon).toBeLessThan(height);
    // Ten sam fit co wideo: jak object-fit: cover, bez zniekształceń.
    expect(b.width / b.height).toBeCloseTo(16 / 9, 2);
  });
}

test.describe("błyski", () => {
  // fastForward przeskakuje czas (odpala zaległe timery raz), bez liczenia każdej klatki rAF.
  test("bez reduced motion: błysk najpóźniej co 15 s", async ({ page }) => {
    await page.clock.install();
    await page.goto("/?boot=off&weather=storm&time=day");
    const layer = page.getByTestId("lightning-layer");
    await expect(layer).toHaveCount(1);
    for (let i = 1; i <= 3; i++) {
      await page.clock.fastForward(15_100);
      await expect(layer).toHaveAttribute("data-strikes", String(i));
    }
  });

  test("reduced motion: żadnych piorunów ani rozjaśnień sceny", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const bolts: string[] = [];
    page.on("request", (request) => request.url().includes("/scenes/storm/") && bolts.push(request.url()));
    await page.clock.install();
    await page.goto("/?boot=off&weather=storm&time=day");
    await expect(page.getByTestId("weather-layers")).toHaveAttribute("data-state", "storm");
    const filter = page.getByTestId("scene").locator(":scope > div").first();
    const filters = new Set<string>();
    for (let i = 0; i < 12; i++) {
      await page.clock.fastForward(5_000);
      filters.add(await filter.evaluate((el) => (el as HTMLElement).style.filter));
    }
    await expect(page.getByTestId("lightning-layer")).toHaveCount(0);
    expect(bolts).toEqual([]);
    expect([...filters]).toEqual(["brightness(0.72) saturate(0.9)"]);
    // Opad zostaje, ale jako nieruchoma klatka.
    await expect(page.getByTestId("precipitation-layer")).toHaveAttribute("data-running", "false");
  });
});

test("podróż w czasie: najechanie = podgląd w kuli, klik = scena i szczegóły, „Wróć do dziś”", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?boot=off&weather=rain&orb-mode=fallback");
  const scene = page.getByTestId("scene");
  const days = page.getByTestId("forecast-day");
  const preview = page.getByTestId("orb-preview");
  await expect(days.first()).toHaveAttribute("aria-pressed", "true");

  // Najechanie: tylko kula, tło bez zmian.
  await days.nth(2).hover();
  await expect(preview).toHaveAttribute("data-visible", "true");
  await expect(page.getByTestId("orb-announcement")).not.toHaveText("");
  await expect(scene).toHaveAttribute("data-weather", "rain");
  await page.mouse.move(5, 5);
  await expect(preview).toHaveAttribute("data-visible", "false");

  // Klik: scena z warstwami tego dnia + szczegóły w łuku.
  const dayState = await days.nth(2).getAttribute("data-state");
  await days.nth(2).click();
  await expect(days.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(scene).toHaveAttribute("data-weather", dayState ?? "");
  await expect(page.getByTestId("weather-layers")).toHaveAttribute("data-state", dayState ?? "");
  const details = page.getByTestId("weather-day-details");
  await expect(details).toBeVisible();
  await expect(details.getByTestId("day-precipitation")).toHaveText(/\d+%|mm|brak danych/);
  await expect(details.getByTestId("day-wind")).toHaveText(/km\/h|brak danych/);
  await expect(details).toContainText(/\d+°.*\/.*\d+°/);
  await expect(page.getByTestId("weather-day-announcement")).toContainText(/do -?\d+°, od -?\d+°/);
  // Wybrany dzień jest w scenie: kula nie dubluje go podglądem.
  await expect(preview).toHaveAttribute("data-visible", "false");

  // Powrót przyciskiem: widok bieżący, scena dziś, fokus na „dziś”.
  await details.getByRole("button", { name: "Wróć do dziś" }).click();
  await expect(page.getByTestId("weather-today")).toBeVisible();
  await expect(details).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-weather", "rain");
  await expect(days.first()).toBeFocused();

  // Powrót klawiszem Esc.
  await days.nth(3).click();
  await expect(page.getByTestId("weather-day-details")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("weather-today")).toBeVisible();
  await expect(scene).toHaveAttribute("data-weather", "rain");

  expect(errors).toEqual([]);
});
