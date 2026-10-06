import { expect, test, type Page } from "@playwright/test";

const USER_DATA = {
  "obok-shopping": { state: { items: [{ id: "u1", name: "Ser użytkownika", done: false }], seeded: true }, version: 1 },
  "obok-reminders": {
    state: { reminders: [{ id: "u2", title: "Spotkanie użytkownika", at: "2030-01-15T09:00:00.000Z", done: false }], seeded: true },
    version: 1,
  },
  "obok-alerts": { state: { alerts: [] }, version: 1 },
} as const;

const KEYS = Object.keys(USER_DATA);

function readUserData(page: Page) {
  return page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), KEYS);
}

test.describe("tryb demo", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("startuje, wykonuje komendę na danych w pamięci, Esc kończy; dane użytkownika nietknięte", async ({ page }) => {
    await page.goto("/?boot=off");
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
    }, USER_DATA);
    const before = await readUserData(page);

    await page.goto("/?demo=1&boot=off");
    const badge = page.getByTestId("demo-badge");
    await expect(badge).toContainText("Tryb demo");
    // Dane demo (przykłady startowe), nie użytkownika.
    await expect(page.getByTestId("shopping-list")).not.toContainText("Ser użytkownika");

    // Scenariusz zmienia porę dnia i pogodę sam.
    const scene = page.getByTestId("scene");
    await expect(scene).toHaveAttribute("data-period", "golden", { timeout: 12_000 });
    await expect(scene).toHaveAttribute("data-weather", "storm", { timeout: 25_000 });

    // Spotlight wpisuje i wykonuje komendę: przypomnienie trafia do pigułki.
    await expect(page.getByRole("combobox")).toHaveValue("przypomnij mi jutro o 9 o dentyście", { timeout: 30_000 });
    await expect(page.getByText("Przypomnienie: Dentysta").first()).toBeVisible({ timeout: 10_000 });
    expect(await readUserData(page)).toEqual(before);

    await page.keyboard.press("Escape");
    await expect(badge).toHaveCount(0);
    await expect(page).not.toHaveURL(/demo=1/);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByTestId("shopping-list")).toContainText("Ser użytkownika");
    expect(await readUserData(page)).toEqual(before);
  });
});
