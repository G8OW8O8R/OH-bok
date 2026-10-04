import { expect, test } from "@playwright/test";

test.describe("Spotlight", () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test("Ctrl+K → przypomnienie z komendy → pigułka i lista przypomnień", async ({ page }) => {
    // Pusta lista przypomnień: nowe przypomnienie jest najbliższe, więc pigułka je pokazuje.
    await page.addInitScript(() => {
      if (!localStorage.getItem("obok-reminders")) {
        localStorage.setItem("obok-reminders", JSON.stringify({ state: { reminders: [], seeded: true }, version: 1 }));
      }
    });
    await page.goto("/?boot=off&weather=rain&time=day");
    await expect(page.getByTestId("pill")).toContainText("Brak nadchodzących przypomnień");

    await page.keyboard.press("Control+k");
    const spotlight = page.getByRole("dialog", { name: /Spotlight/ });
    await expect(spotlight).toBeVisible();
    const input = spotlight.getByRole("combobox");
    await expect(input).toBeFocused();
    await expect(page.getByTestId("orb")).toHaveAttribute("data-state", "listening");

    await input.fill("przypomnij mi jutro o 9 o dentyście");
    const result = spotlight.getByRole("option").first();
    await expect(result).toContainText("Utwórz przypomnienie");
    await expect(result).toContainText("jutro, 09:00");
    await expect(result).toContainText("Dentysta");

    await input.press("Enter");
    await expect(spotlight.getByTestId("spotlight-progress")).toContainText("Rozumiem polecenie");
    await expect(spotlight.getByTestId("spotlight-progress")).toContainText("Gotowe");
    await expect(spotlight.getByTestId("spotlight-outcome")).toContainText("Dentysta");
    await expect(page.getByTestId("pill")).toContainText("Dentysta");

    await page.keyboard.press("Escape");
    await expect(spotlight).toBeHidden();
    await expect(page.getByTestId("orb-button")).toBeFocused();
    await expect(page.getByTestId("reminders")).toContainText("Dentysta");
    await expect(page.getByTestId("pill")).toContainText("Dentysta");

    // Lista w oknie Przypomnień (i zapis przetrwa odświeżenie).
    await page.reload();
    await page.getByTestId("reminders").getByRole("button").first().click();
    await expect(page.getByRole("dialog", { name: "Przypomnienia" })).toContainText("Dentysta");
  });
});
