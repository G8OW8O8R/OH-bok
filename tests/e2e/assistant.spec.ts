import { expect, test, type Route } from "@playwright/test";

/** Podstawiony `/api/assistant`: NDJSON jak z serwera, z opóźnieniem (kula „myśli”). */
async function fulfill(route: Route, events: unknown[], delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await route.fulfill({
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "x-obok-provider": "groq" },
    body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  });
}

test.describe("Asystent AI w Spotlight", () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test("pytanie → odpowiedź tekstowa; kilka komend naraz → podgląd, Enter, wykonanie", async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem("obok-reminders")) {
        localStorage.setItem("obok-reminders", JSON.stringify({ state: { reminders: [], seeded: true }, version: 1 }));
      }
    });
    const requests: { query: string; context: { shopping: unknown[] } }[] = [];
    const reminderAt = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    await page.route("**/api/assistant", async (route) => {
      const body = route.request().postDataJSON() as { query: string; context: { shopping: unknown[] } };
      requests.push(body);
      if (body.query.startsWith("co mam")) {
        await fulfill(
          route,
          [
            { type: "provider", provider: "groq" },
            { type: "text", delta: "Jutro masz jedno przypomnienie: dentysta o 9:00. " },
            { type: "text", delta: "Na liście zakupów czekają jajka, a pogoda zapowiada przelotny deszcz." },
            { type: "done" },
          ],
          700,
        );
        return;
      }
      await fulfill(
        route,
        [
          { type: "provider", provider: "groq" },
          {
            type: "commands",
            commands: [
              { kind: "addItems", items: ["Mąka", "Mleko", "Jajka", "Olej"] },
              { kind: "reminder", title: "Zakupy", at: reminderAt },
              // Spoza unii parsera: klient odrzuca.
              { kind: "deleteAll" },
            ],
          },
          { type: "done" },
        ],
        300,
      );
    });

    await page.goto("/?boot=off&weather=rain&time=day");
    // Po hydracji (pigułka z danymi) skrót już działa.
    await expect(page.getByTestId("pill")).toContainText("Brak nadchodzących przypomnień");
    await page.keyboard.press("Control+k");
    const spotlight = page.getByRole("dialog", { name: /Spotlight/ });
    const input = spotlight.getByRole("combobox");
    await expect(input).toBeFocused();
    const orb = page.getByTestId("orb");

    // Pytanie: parser go nie rozumie → „Zapytaj Obok” → kula myśli, potem mówi.
    await input.fill("co mam jutro?");
    await expect(spotlight.getByRole("option").first()).toContainText("Zapytaj Obok");
    await input.press("Enter");
    await expect(orb).toHaveAttribute("data-state", "thinking");
    const answer = spotlight.getByTestId("spotlight-answer");
    await expect(orb).toHaveAttribute("data-state", "speaking");
    await expect(answer).toContainText("dentysta o 9:00");
    await expect(answer).toHaveAttribute("data-complete", "true");
    await expect(answer).toContainText("przelotny deszcz.");
    await expect(answer.getByTestId("spotlight-source")).toHaveText("odpowiedział: Groq");
    await expect(orb).toHaveAttribute("data-state", "listening");
    expect(requests[0]?.query).toBe("co mam jutro?");
    expect(requests[0]?.context.shopping.length).toBeGreaterThan(0);

    // Kilka komend naraz: podgląd jak z parsera, Enter wykonuje wszystkie.
    await input.fill("dodaj składniki na naleśniki i przypomnij mi o 18 o zakupach");
    await input.press("Enter");
    const rows = spotlight.getByRole("option");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Dodaj do listy");
    await expect(rows.nth(0)).toContainText("Mąka, Mleko, Jajka, Olej");
    await expect(rows.nth(1)).toContainText("Utwórz przypomnienie");
    await expect(spotlight.getByTestId("spotlight-source")).toHaveText("odpowiedział: Groq");
    // Nic nie wykonuje się przed Enterem.
    await expect(page.getByTestId("pill")).not.toContainText("Zakupy");

    await input.press("Enter");
    await expect(spotlight.getByTestId("spotlight-progress")).toContainText("Gotowe");
    await expect(spotlight.getByTestId("spotlight-outcome")).toHaveCount(2);
    await expect(page.getByTestId("pill")).toContainText("Zakupy");

    await page.keyboard.press("Escape");
    await expect(spotlight).toBeHidden();
    await expect(page.locator("#shopping")).toContainText("Mąka");
    await expect(page.getByTestId("reminders")).toContainText("Zakupy");
  });
});
