import { devices, expect, test } from "@playwright/test";

test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

test("mobile 390×844: kolumna bez poziomego przewijania, dock w ekranie, dzień dotykiem: podgląd, potem przypięcie", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/?boot=off&weather=sunny&time=day&orb-mode=fallback");

  // Bez poziomego przewijania.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  // Kolejność kolumny: kula i powitanie, łuk pogody, lista, przypomnienia, przepis, odtwarzacz.
  const tops = await page.evaluate(() =>
    ["orb", "weather-arc", "shopping", "reminders", "recipe", "player"].map((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`) ?? document.getElementById(id);
      return el ? el.getBoundingClientRect().top + window.scrollY : Number.NaN;
    }),
  );
  expect(tops.every(Number.isFinite)).toBe(true);
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);

  // Dock przyklejony u dołu i nie szerszy niż ekran (przyciski przewijają się w nim).
  const dock = await page.getByTestId("dock").boundingBox();
  expect(dock).not.toBeNull();
  expect(dock!.x).toBeGreaterThanOrEqual(0);
  expect(dock!.x + dock!.width).toBeLessThanOrEqual(390);
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(844);

  // Dotyk: pierwsze dotknięcie dnia = podgląd w kuli (scena bez zmian), drugie = przypięcie.
  const day = page.getByTestId("forecast-day").nth(2);
  await day.scrollIntoViewIfNeeded();
  await day.tap();
  await expect(page.getByTestId("orb-announcement")).not.toHaveText("");
  await expect(day).toHaveAttribute("aria-pressed", "false");
  await day.tap();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("weather-day-details")).toBeVisible();
  await expect(page.getByTestId("orb-announcement")).toHaveText("");
  expect(errors).toEqual([]);
});
