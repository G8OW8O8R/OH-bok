import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const ANNOUNCEMENT = /^(Dziś|Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota|Niedziela): [a-ząćęłńóśźż]+, (-?\d+°|brak danych o temperaturze)$/;

test("kula w CSS: podgląd dnia w kuli z odpowiednikiem tekstowym, także z klawiatury", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?weather=rain&orb-mode=fallback&orb=speaking");

  const orb = page.getByTestId("orb");
  await expect(orb).toHaveAttribute("data-mode", "fallback");
  await expect(orb).toHaveAttribute("data-fallback-reason", "forced");
  await expect(orb).toHaveAttribute("data-state", "speaking");
  await expect(page.getByTestId("orb-canvas")).toHaveCount(0);

  const days = page.getByTestId("forecast-day");
  const announcement = page.getByTestId("orb-announcement");
  await days.nth(1).hover();
  await expect(page.getByTestId("orb-preview")).toHaveAttribute("data-visible", "true");
  await expect(announcement).toHaveText(ANNOUNCEMENT);

  await page.mouse.move(5, 5);
  await expect(page.getByTestId("orb-preview")).toHaveAttribute("data-visible", "false");
  await expect(announcement).toHaveText("");

  // Klawiatura: fokus pokazuje podgląd, klik przypina go na stałe.
  await days.nth(2).focus();
  await expect(announcement).toHaveText(ANNOUNCEMENT);
  await days.nth(2).press("Enter");
  await expect(days.nth(2)).toHaveAttribute("aria-pressed", "true");
  await days.nth(2).blur();
  await expect(announcement).toHaveText(ANNOUNCEMENT);

  expect(errors).toEqual([]);
});

test("kula WebGL: pojawia się nad kulą CSS i pauzuje przy ukrytej karcie", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?weather=rain&orb-mode=webgl");
  const webgl2 = await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
  test.skip(!webgl2, "przeglądarka testowa bez WebGL2");

  const orb = page.getByTestId("orb");
  const canvas = page.getByTestId("orb-canvas");
  await expect(orb).toHaveAttribute("data-mode", "webgl");
  await expect(orb).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect(page.getByTestId("orb-fallback")).toHaveAttribute("data-hidden", "true");
  await expect(canvas).toHaveAttribute("data-running", "true");

  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  await expect(canvas).toHaveAttribute("data-running", "false");
  await setHidden(false);
  await expect(canvas).toHaveAttribute("data-running", "true");

  expect(errors).toEqual([]);
});
