import { expect, test, type Locator, type Page } from "@playwright/test";

const OBJECTS = ["weather-arc", "shopping-list", "reminders", "recipe", "player", "dock", "pill", "greeting", "orb"];

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element bez pudełka");
  return b;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
] as const) {
  test(`pulpit ${width}×${height}: wszystkie obiekty w kadrze, bez nachodzenia, latarnia wolna`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height });
    await page.goto("/?weather=rain");

    for (const id of OBJECTS) {
      const b = await box(page.getByTestId(id));
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.y, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, id).toBeLessThanOrEqual(width);
      expect(b.y + b.height, id).toBeLessThanOrEqual(height);
    }

    // Rząd obiektów i dock nie nachodzą na siebie.
    const row = ["weather-arc", "shopping-list", "reminders", "recipe", "player"];
    const boxes = await Promise.all(row.map((id) => box(page.getByTestId(id))));
    const dock = await box(page.getByTestId("dock"));
    boxes.forEach((a, i) => {
      expect(overlaps(a, dock), `${row[i]} vs dock`).toBe(false);
      boxes.slice(i + 1).forEach((b, j) => expect(overlaps(a, b), `${row[i]} vs ${row[i + j + 1]}`).toBe(false));
    });

    // Latarnia (wieża ~74–81% szerokości klatki, górne 60% wysokości) pozostaje odsłonięta.
    const tower = { x: width * 0.74, y: 0, width: width * 0.07, height: height * 0.6 };
    for (const id of ["greeting", "orb", "pill"]) {
      expect(overlaps(await box(page.getByTestId(id)), tower), id).toBe(false);
    }

    // Strona się nie przewija w układzie desktopowym.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("tablet 820×1180: kolumny, kula u góry, bez poziomego przewijania", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/?weather=rain");
  const orb = await box(page.getByTestId("orb"));
  for (const id of ["weather-arc", "shopping-list", "reminders", "recipe", "player"]) {
    const b = await box(page.getByTestId(id));
    expect(b.y, id).toBeGreaterThan(orb.y + orb.height);
    expect(b.x + b.width, id).toBeLessThanOrEqual(820);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("zoom 200% (1440×900 → 720×450 CSS px): tekst rośnie fizycznie", async ({ browser }) => {
  const measure = async (width: number, height: number, deviceScaleFactor: number) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
    const page = await context.newPage();
    await page.goto("/?weather=rain");
    const px = await page
      .getByTestId("reminders")
      .getByText("Zespół")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await context.close();
    return px * deviceScaleFactor; // piksele fizyczne
  };
  const normal = await measure(1440, 900, 1);
  const zoomed = await measure(720, 450, 2);
  expect(zoomed / normal).toBeGreaterThanOrEqual(1.9);
});

test("dock: klawiatura, aktywna aplikacja, niegotowe oznaczone „wkrótce”", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?weather=rain");
  const dock = page.getByRole("navigation", { name: "Aplikacje" });
  const weather = dock.getByRole("button", { name: "Pogoda" });
  await expect(weather).toHaveAttribute("aria-current", "true");
  await expect(dock.getByRole("button", { name: "Rynki" })).toHaveAttribute("aria-disabled", "true");
  await expect(dock.getByRole("button", { name: "Rynki" })).toHaveAccessibleDescription("Rynki · wkrótce");

  await weather.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("weather-arc")).toBeFocused();
});

test("„+” przepisu dodaje składniki do listy i ogłasza to w pigułce", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?weather=rain");
  await expect(page.getByTestId("shopping-list")).toContainText("Kupione 3 z 4");
  await page.getByRole("button", { name: /Dodaj składniki do listy/ }).click();
  await expect(page.getByTestId("shopping-list")).toContainText("Kupione 3 z 7");
  await expect(page.getByTestId("pill")).toContainText("Dodano 3 składniki do listy");
  await expect(page.getByRole("button", { name: "Składniki dodane do listy" })).toBeDisabled();
});

test("prefers-reduced-motion: kursor nie przesuwa obiektów", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/?weather=rain");
  const arc = page.getByTestId("weather-arc");
  const before = await box(arc);
  await page.mouse.move(10, 10);
  await page.mouse.move(1400, 880, { steps: 5 });
  await page.waitForTimeout(600);
  expect(await box(arc)).toEqual(before);
  await context.close();
});

test("parallax: bliższe obiekty przesuwają się mocniej niż dalsze", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?weather=rain");
  const far = page.getByTestId("weather-arc");
  const near = page.getByTestId("recipe");
  await page.mouse.move(720, 450);
  await page.waitForTimeout(800);
  const [far0, near0] = [await box(far), await box(near)];
  await page.mouse.move(1430, 450, { steps: 8 });
  await page.waitForTimeout(1200);
  const [far1, near1] = [await box(far), await box(near)];
  const farShift = Math.abs(far1.x - far0.x);
  const nearShift = Math.abs(near1.x - near0.x);
  expect(farShift).toBeGreaterThan(0);
  expect(nearShift).toBeGreaterThan(farShift * 2);
});
