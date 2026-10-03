import { expect, test, type Page } from "@playwright/test";

const VIEWPORT = { width: 1440, height: 900 };

/** Wstępnie wypełnia localStorage (tylko gdy pusty), żeby test nie zależał od pory dnia. */
async function seed(page: Page, data: { reminders?: unknown[]; items?: unknown[] }) {
  await page.addInitScript(
    ([reminders, items]) => {
      if (!localStorage.getItem("obok-reminders")) {
        localStorage.setItem("obok-reminders", JSON.stringify({ state: { reminders, seeded: true }, version: 1 }));
      }
      if (!localStorage.getItem("obok-shopping")) {
        localStorage.setItem("obok-shopping", JSON.stringify({ state: { items, seeded: true }, version: 1 }));
      }
    },
    [data.reminders ?? [], data.items ?? []] as const,
  );
}

const reminder = (id: string, title: string, inMs: number) => ({
  id,
  title,
  at: new Date(Date.now() + inMs).toISOString(),
  done: false,
});

test.describe("lista zakupów", () => {
  test.use({ viewport: VIEWPORT });

  test("dodawanie, odhaczanie, usuwanie; dane przetrwają odświeżenie", async ({ page }) => {
    await seed(page, { items: [{ id: "a", name: "Jajka", done: false }] });
    await page.goto("/?boot=off&weather=rain");
    const tile = page.getByTestId("shopping-list");
    await expect(tile).toContainText("Kupione 0 z 1");

    await tile.getByRole("button", { name: "Otwórz listę zakupów" }).click();
    const panel = page.getByRole("dialog", { name: "Lista zakupów" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Nowa pozycja" })).toBeFocused();

    await page.keyboard.type("Ser żółty");
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("listitem").filter({ hasText: "Ser żółty" })).toBeVisible();

    await panel.getByRole("checkbox", { name: "Jajka" }).check();
    await expect(panel.getByRole("region", { name: /Kupione/ })).toContainText("Jajka");

    await panel.getByRole("button", { name: "Usuń: Ser żółty" }).click();
    await expect(panel.getByText("Ser żółty")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(tile).toContainText("Kupione 1 z 1");
    // Fokus wraca na przycisk, który otworzył panel.
    await expect(tile.getByRole("button", { name: "Otwórz listę zakupów" })).toBeFocused();

    await page.reload();
    await expect(page.getByTestId("shopping-list")).toContainText("Kupione 1 z 1");
    await expect(page.getByTestId("shopping-list")).toContainText("Jajka");
  });

  test("brief zawiera liczbę rzeczy na liście, gdy brak przypomnień na dziś", async ({ page }) => {
    await seed(page, {
      items: [
        { id: "a", name: "Jajka", done: false },
        { id: "b", name: "Ser", done: false },
      ],
    });
    await page.goto("/?boot=off&weather=rain");
    await expect(page.locator(".brief")).toContainText(/Do\s+kupienia\s+2\s+rzeczy/);
  });

  test("prefers-reduced-motion: panel działa tak samo", async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
    const page = await context.newPage();
    await seed(page, { items: [{ id: "a", name: "Jajka", done: false }] });
    await page.goto("/?boot=off&weather=rain");
    await page.getByRole("button", { name: "Otwórz listę zakupów" }).click();
    const panel = page.getByRole("dialog", { name: "Lista zakupów" });
    // Bez rysowania i zsuwania: pozycja przechodzi do „Kupione” od razu (stara wersja znika w ≤ 150 ms).
    await panel.getByRole("checkbox", { name: "Jajka" }).click();
    await expect(panel.getByRole("region", { name: /Kupione/ })).toContainText("Jajka");
    await context.close();
  });
});

test.describe("przypomnienia i pigułka", () => {
  test.use({ viewport: VIEWPORT });

  test("pigułka pokazuje to samo, co pierwsza pozycja listy; dodanie i usunięcie je zmienia", async ({ page }) => {
    await seed(page, { reminders: [reminder("r1", "Dentysta", 3 * 3600_000)] });
    await page.goto("/?boot=off&weather=rain");
    const pill = page.getByTestId("pill");
    const tile = page.getByTestId("reminders");
    await expect(pill).toContainText("Dentysta");
    await expect(tile.getByRole("listitem").first()).toContainText("Dentysta");

    await tile.getByRole("button", { name: "Otwórz przypomnienia" }).click();
    const panel = page.getByRole("dialog", { name: "Przypomnienia" });
    await expect(panel.getByRole("textbox", { name: "O czym przypomnieć" })).toBeFocused();

    // Walidacja: pusty tytuł.
    await panel.getByRole("button", { name: "Dodaj" }).click();
    await expect(panel.getByRole("alert")).toContainText("Wpisz, o czym przypomnieć");

    // Szybki termin „Za 15 min”, wcześniejszy niż „Dentysta”: staje się najbliższy.
    await panel.getByRole("textbox", { name: "O czym przypomnieć" }).fill("Wcześniej");
    await panel.getByRole("button", { name: "Za 15 min" }).click();
    await expect(panel.getByRole("button", { name: "Za 15 min" })).toHaveAttribute("aria-pressed", "true");
    await panel.getByRole("button", { name: "Dodaj" }).click();
    await expect(panel.getByRole("list").first().getByRole("listitem").first()).toContainText("Wcześniej");

    await page.keyboard.press("Escape");
    await expect(pill).toContainText("Wcześniej");
    await expect(tile.getByRole("listitem").first()).toContainText("Wcześniej");

    await page.reload();
    await expect(page.getByTestId("pill")).toContainText("Wcześniej");

    await page.getByRole("button", { name: "Otwórz przypomnienia" }).click();
    await page.getByRole("dialog", { name: "Przypomnienia" }).getByRole("button", { name: "Usuń: Wcześniej" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pill")).toContainText("Dentysta");
  });

  test("w chwili terminu pigułka się rozwija; drzemka przyciskiem odkłada o 10 min", async ({ page }) => {
    await seed(page, { reminders: [reminder("r1", "Dentysta", 3000)] });
    await page.goto("/?boot=off&weather=rain");
    const pill = page.getByTestId("pill");
    await expect(pill).not.toHaveAttribute("data-due", "true");
    await expect(pill).toHaveAttribute("data-due", "true", { timeout: 15_000 });
    await expect(pill).toContainText("Teraz:");
    await expect(page.locator(".brief")).toContainText("Teraz:");

    await pill.getByRole("button", { name: "Drzemka 10 min" }).click();
    await expect(pill).not.toHaveAttribute("data-due", "true");
    await expect(pill).toContainText(/Za (9|10) min/);

    await page.reload();
    await expect(page.getByTestId("pill")).toContainText(/Za (9|10) min/);
  });

  test("swipe w bok na rozwiniętej pigułce = drzemka", async ({ page }) => {
    await seed(page, { reminders: [reminder("r1", "Dentysta", -1000)] });
    await page.goto("/?boot=off&weather=rain");
    const pill = page.getByTestId("pill");
    await expect(pill).toHaveAttribute("data-due", "true");
    const box = await pill.boundingBox();
    if (!box) throw new Error("brak pudełka pigułki");
    const y = box.y + 14;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, y, { steps: 10 });
    await page.mouse.up();
    await expect(pill).not.toHaveAttribute("data-due", "true");
    await expect(pill).toContainText(/Za (9|10) min/);
  });

  test("„Gotowe” kończy przypomnienie; klawiatura i reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
    const page = await context.newPage();
    await seed(page, { reminders: [reminder("r1", "Dentysta", -1000)] });
    await page.goto("/?boot=off&weather=rain");
    const pill = page.getByTestId("pill");
    await expect(pill).toHaveAttribute("data-due", "true");
    await pill.getByRole("button", { name: "Gotowe" }).focus();
    await page.keyboard.press("Enter");
    await expect(pill).toContainText("Brak nadchodzących przypomnień");
    await expect(page.getByTestId("reminders")).toContainText("Brak przypomnień");
    await context.close();
  });

  test("pierwsza wizyta: przykładowe przypomnienia w rozsądnych godzinach", async ({ page }) => {
    await page.goto("/?boot=off&weather=rain");
    const times = page.getByTestId("reminders").locator("time");
    await expect(times).toHaveCount(3);
    for (const text of await times.allInnerTexts()) {
      const [, hh] = /(\d{2}):\d{2}$/.exec(text) ?? [];
      expect(Number(hh)).toBeGreaterThanOrEqual(8);
      expect(Number(hh)).toBeLessThanOrEqual(20);
    }
  });
});

test.describe("panel: tło, własny termin, niskie ekrany", () => {
  test.use({ viewport: VIEWPORT });

  test("tło przyciemnia pulpit, klik w tło zamyka panel; pole ma stały wskaźnik i bursztynowy kursor", async ({ page }) => {
    await seed(page, { items: [{ id: "a", name: "Jajka", done: false }] });
    await page.goto("/?boot=off&weather=cloudy");
    await page.getByRole("button", { name: "Otwórz listę zakupów" }).click();
    const panel = page.getByRole("dialog", { name: "Lista zakupów" });
    const field = panel.getByRole("textbox", { name: "Nowa pozycja" });
    await expect(field).toBeFocused();

    const style = () =>
      field.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { outline: `${cs.outlineStyle} ${cs.outlineColor}`, caret: cs.caretColor };
      });
    const amber = "rgb(245, 160, 74)";
    expect(await style()).toEqual({ outline: `solid ${amber}`, caret: amber });
    await page.keyboard.type("Mleko");
    expect(await style()).toEqual({ outline: `solid ${amber}`, caret: amber });

    const backdrop = page.getByTestId("panel-backdrop");
    await expect(backdrop).toHaveCSS("backdrop-filter", /blur/);
    await backdrop.click({ position: { x: 8, y: 8 } });
    await expect(panel).toHaveCount(0);
  });

  test("własny termin z klawiatury: kalendarz i godzina; Esc zwija tylko wybór", async ({ page }) => {
    await seed(page, { reminders: [] });
    await page.goto("/?boot=off&weather=rain");
    await page.getByRole("button", { name: "Otwórz przypomnienia" }).click();
    const panel = page.getByRole("dialog", { name: "Przypomnienia" });
    await panel.getByRole("textbox", { name: "O czym przypomnieć" }).fill("Paczka");

    const toggle = panel.getByRole("button", { name: "Inna data" });
    await toggle.click();
    await expect(panel.getByRole("button", { expanded: true })).toBeVisible();
    const grid = panel.getByRole("grid");
    await expect(grid).toBeVisible();

    // Dni z przeszłości są poza zasięgiem: PageUp i strzałka w lewo zatrzymują się na dziś.
    await grid.locator('button[tabindex="0"]').focus();
    await page.keyboard.press("PageUp");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(":focus")).toHaveAttribute("aria-current", "date");

    // Za tydzień w ten sam dzień.
    await page.keyboard.press("ArrowDown");
    const target = await page.locator(":focus").getAttribute("data-date");
    await page.keyboard.press("Enter");
    await expect(grid.locator(`[data-date="${target}"]`).locator("xpath=..")).toHaveAttribute("aria-selected", "true");

    const hour = panel.getByRole("spinbutton", { name: "Godzina" });
    await hour.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowUp");
    await panel.getByRole("spinbutton", { name: "Minuty" }).focus();
    await page.keyboard.press("End");
    await expect(hour).toHaveAttribute("aria-valuetext", "09");
    await expect(panel.getByTestId("reminder-due")).toContainText("09:55");

    await page.keyboard.press("Escape");
    await expect(grid).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { expanded: false }).filter({ hasText: "09:55" })).toBeFocused();

    await panel.getByRole("button", { name: "Dodaj" }).click();
    await expect(panel.getByRole("listitem").filter({ hasText: "Paczka" })).toContainText("09:55");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  const many = Array.from({ length: 8 }, (_, i) => reminder(`r${i}`, `Sprawa ${i + 1}`, (i + 2) * 3600_000));

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 375, height: 667 },
  ]) {
    test(`${viewport.width}×${viewport.height}: panel się przewija, „Dodaj” zawsze widoczny`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      await seed(page, { reminders: many });
      await page.goto("/?boot=off&weather=rain");
      await page.getByRole("button", { name: "Otwórz przypomnienia" }).click();
      const panel = page.getByRole("dialog", { name: "Przypomnienia" });
      await panel.getByRole("button", { name: "Inna data" }).click();
      await expect(panel.getByRole("grid")).toBeVisible();

      const add = panel.getByRole("button", { name: "Dodaj" });
      await expect(add).toBeInViewport({ ratio: 1 });
      const scroller = panel.locator("[data-panel-scroll]");
      expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

      await panel.getByRole("listitem").filter({ hasText: "Sprawa 8" }).scrollIntoViewIfNeeded();
      await expect(panel.getByRole("listitem").filter({ hasText: "Sprawa 8" })).toBeInViewport();
      await expect(add).toBeInViewport({ ratio: 1 });
      await context.close();
    });
  }
});
