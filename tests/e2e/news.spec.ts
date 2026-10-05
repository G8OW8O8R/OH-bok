import { expect, test } from "@playwright/test";

/** Podstawiony `/api/news`: po 10 nagłówków na kategorię + streszczenie AI. */
function digest() {
  const now = Date.now();
  const list = (category: "polska" | "swiat", label: string) =>
    Array.from({ length: 10 }, (_, i) => ({
      id: `${category}-${i}`,
      title: `${label} nagłówek ${i + 1}: ${"bardzo długi tytuł wiadomości, który zajmie więcej niż dwie linie w kafelku ".repeat(i === 0 ? 2 : 1)}`,
      url: `https://www.rmf24.pl/${category}/${i + 1}`,
      sourceId: category === "polska" ? "rmf24-polska" : "euronews",
      source: category === "polska" ? "RMF24" : "Euronews",
      publishedAt: new Date(now - (i + 1) * 15 * 60_000).toISOString(),
      alsoIn: i === 0 && category === "polska" ? ["Bankier.pl"] : [],
    }));
  return {
    fetchedAt: new Date(now).toISOString(),
    demo: false,
    categories: { polska: list("polska", "Krajowy"), swiat: list("swiat", "Światowy") },
    summary: {
      polska: "Sejm przyjął budżet, a rząd pokazał plan mieszkaniowy.",
      swiat: "Szczyt UE w Brukseli i fala upałów na południu Europy.",
      provider: "groq",
      generatedAt: new Date(now).toISOString(),
    },
    summaryPending: false,
    feeds: [
      { id: "rmf24-polska", name: "RMF24", category: "polska", state: "live" },
      { id: "euronews", name: "Euronews", category: "swiat", state: "live" },
    ],
  };
}

test.describe("Wiadomości", () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test("widget: streszczenie + 3 nagłówki, Polska/Świat, linki w nowej karcie; klik otwiera okno z 10 nagłówkami", async ({ page }) => {
    await page.route("**/api/news", (route) =>
      route.fulfill({ status: 200, headers: { "content-type": "application/json", "x-obok-cache": "hit" }, body: JSON.stringify(digest()) }),
    );
    await page.goto("/?boot=off&weather=rain&time=day");

    const widget = page.getByTestId("news");
    await expect(widget.getByText("Sejm przyjął budżet, a rząd pokazał plan mieszkaniowy.")).toBeVisible();
    await expect(widget.getByText("Dziś w skrócie · AI")).toBeVisible();
    const headlines = widget.getByTestId("news-headline");
    await expect(headlines).toHaveCount(3);
    await expect(headlines.first()).toContainText("RMF24");

    // Nagłówek: link do artykułu w nowej karcie, maks. 2 linie (wielokropek), bez treści artykułu.
    const link = headlines.first().getByRole("link");
    await expect(link).toHaveAttribute("href", "https://www.rmf24.pl/polska/1");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const lines = await link.locator("span.line-clamp-2").evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(Math.round(lines)).toBeLessThanOrEqual(2);
    // Kafelek nie wystaje poza swój rozmiar (najdłuższy nagłówek + streszczenie).
    const widgetBox = await widget.boundingBox();
    const lastBox = await headlines.last().boundingBox();
    expect(lastBox && widgetBox && lastBox.y + lastBox.height).toBeLessThanOrEqual((widgetBox?.y ?? 0) + (widgetBox?.height ?? 0));

    await widget.getByRole("radio", { name: "Świat" }).click();
    await expect(widget.getByText("Szczyt UE w Brukseli i fala upałów na południu Europy.")).toBeVisible();
    await expect(headlines.first()).toContainText("Światowy nagłówek 1");

    // Klik w tło kafelka (nie w link) otwiera okno z tą samą kategorią.
    await widget.click({ position: { x: 8, y: 140 } });
    await expect(page).toHaveURL(/[?&]app=wiadomosci/);
    const dialog = page.getByRole("dialog", { name: "Wiadomości" });
    await expect(dialog.getByTestId("news-list").getByTestId("news-headline")).toHaveCount(10);
    await expect(dialog.getByTestId("news-summary")).toHaveText("Szczyt UE w Brukseli i fala upałów na południu Europy.");
    await expect(page.getByRole("tab", { name: "Świat" })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByText("także: Bankier.pl")).toHaveCount(0);

    await page.getByRole("tab", { name: "Polska" }).click();
    await expect(dialog.getByText("także: Bankier.pl")).toBeVisible();
    await expect(page.getByTestId("news-status")).toContainText("Na żywo");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/app=wiadomosci/);
  });
});
