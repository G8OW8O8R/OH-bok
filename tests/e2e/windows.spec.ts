import { expect, test, type Locator } from "@playwright/test";

/** Okno rozwija się z ikony sprężyną: pomiary dopiero, gdy pudełko przestanie się zmieniać. */
async function settled(win: Locator) {
  let last = "";
  await expect
    .poll(async () => {
      const box = JSON.stringify(await win.boundingBox());
      const same = box === last;
      last = box;
      return same;
    }, { intervals: [150] })
    .toBe(true);
}

test("okno Pogody: z docka, adres, przeciąganie z zapamiętaniem, przypięcie dnia, „wstecz” i powrót fokusu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?boot=off&weather=rain&time=day");

  // Dock ma tylko istniejące aplikacje, bez „wkrótce”.
  const dock = page.getByRole("navigation", { name: "Aplikacje" });
  await expect(dock.getByRole("button")).toHaveText(["", "", "", ""]);
  await expect(dock.getByRole("button", { name: "Muzyka" })).toHaveCount(0);

  const icon = dock.getByRole("button", { name: "Pogoda" });
  await icon.focus();
  await page.keyboard.press("Enter");
  const win = page.getByRole("dialog", { name: "Pogoda" });
  await expect(win).toBeVisible();
  await expect(page).toHaveURL(/[?&]app=pogoda(&|$)/);
  await expect(page).toHaveURL(/weather=rain/);
  await expect(icon).toHaveAttribute("aria-current", "true");
  await expect(win.getByTestId("weather-day-card")).toHaveCount(7);
  await expect(win.getByTestId("weather-hourly")).toBeVisible();
  await expect(win.getByRole("link", { name: "Open-Meteo.com" })).toBeVisible();
  // Pulpit pod oknem jest nieaktywny.
  expect(await page.locator(".desktop-objects").getAttribute("inert")).not.toBeNull();

  // Przeciąganie za nagłówek: okno jedzie za kursorem, pozycja przetrwa przeładowanie.
  await settled(win);
  const before = await win.boundingBox();
  const header = win.locator("header");
  const grip = await header.boundingBox();
  if (!before || !grip) throw new Error("brak okna");
  await page.mouse.move(grip.x + 160, grip.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(grip.x + 160 - i * 15, grip.y + 20 + i * 3);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("obok-windows"))).toContain("weather");
  const moved = await win.boundingBox();
  expect(moved && moved.x).toBeLessThan(before.x - 60);

  await page.reload();
  await expect(win).toBeVisible();
  await expect.poll(async () => Math.round((await win.boundingBox())?.x ?? 0)).toBeLessThan(before.x - 60);

  // Wybór dnia i „Pokaż na pulpicie”: scena tego dnia, okno się zamyka.
  await win.getByTestId("weather-day-card").nth(2).click();
  await expect(win.getByTestId("weather-day-card").nth(2)).toHaveAttribute("aria-pressed", "true");
  await win.getByRole("button", { name: "Pokaż na pulpicie" }).click();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/app=/);
  await expect(page.getByTestId("weather-day-details")).toBeVisible();

  // Otwarcie z docka i „wstecz” w przeglądarce zamyka okno, fokus wraca na ikonę.
  await icon.click();
  await expect(win).toBeVisible();
  await expect(win.getByRole("button", { name: "Na pulpicie" })).toBeDisabled();
  await page.goBack();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/app=/);
  await expect(icon).toBeFocused();
});
