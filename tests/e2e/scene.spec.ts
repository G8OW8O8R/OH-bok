import { expect, test, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("domyślnie scena deszczowa z posterem w HTML z serwera", async ({ page, request }) => {
  const errors = collectConsoleErrors(page);

  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<link[^>]+rel="preload"[^>]+rain-lighthouse\/poster\.jpg/);
  expect(html).toContain('poster="/scenes/rain-lighthouse/poster.jpg"');

  await page.goto("/");
  await expect(page.getByTestId("scene")).toHaveAttribute("data-weather", "rain");
  const video = page.locator("[data-testid=scene-layer] video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("src", "/scenes/rain-lighthouse/loop-720.mp4");

  expect(errors).toEqual([]);
});

for (const [weather, folder] of [
  ["sunny", "sunny-lighthouse"],
  ["cloudy", "cloudy-lighthouse"],
] as const) {
  test(`?weather=${weather} wybiera właściwą scenę`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/?weather=${weather}`);
    await expect(page.getByTestId("scene")).toHaveAttribute("data-weather", weather);
    await expect(page.locator("[data-testid=scene-layer] video")).toHaveAttribute(
      "src",
      `/scenes/${folder}/loop-720.mp4`,
    );
    expect(errors).toEqual([]);
  });
}

test("przełączenie sceny przenika bez przesunięcia layoutu", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page.evaluate(() => {
    const w = window as Window & { __cls?: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__cls = (w.__cls ?? 0) + (entry as PerformanceEntry & { value: number }).value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  const scene = page.getByTestId("scene");
  const before = await scene.boundingBox();

  await page.getByRole("link", { name: "sunny" }).click();
  await expect(page).toHaveURL(/weather=sunny/);

  // W trakcie przejścia żyją dokładnie dwa elementy <video>…
  await expect(page.locator("[data-testid=scene-layer]")).toHaveCount(2);
  // …a po przenikaniu zostaje tylko nowa scena.
  const layers = page.locator("[data-testid=scene-layer]");
  await expect(layers).toHaveCount(1, { timeout: 8000 });
  await expect(layers.first()).toHaveAttribute("data-video", "sunny");

  expect(await scene.boundingBox()).toEqual(before);
  const cls = await page.evaluate(() => (window as Window & { __cls?: number }).__cls ?? 0);
  expect(cls).toBe(0);
  expect(errors).toEqual([]);
});
