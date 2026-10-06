import { expect, test, type Locator, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const layerVideo = (page: Page) => page.locator("[data-testid=scene-layer] video");
const layerPoster = (page: Page) => page.locator("[data-testid=scene-layer] img");
/** Źródła wideo warstwy w kolejności z HTML (AV1 pierwsze, gdy dekodowanie jest sprzętowe). */
const videoSources = (page: Page) =>
  layerVideo(page).evaluate((el) => [...el.querySelectorAll("source")].map((source) => source.getAttribute("src")));

test("scena deszczowa: poster w HTML z serwera, wideo wczytywane dopiero po hydracji", async ({
  page,
  request,
}) => {
  const errors = collectConsoleErrors(page);

  const html = await (await request.get("/?weather=rain")).text();
  expect(html).toMatch(/<link[^>]+rel="preload"[^>]+rain-lighthouse\/poster\.avif[^>]+type="image\/avif"/);
  expect(html).toMatch(/<source type="image\/avif" srcSet="\/scenes\/rain-lighthouse\/poster\.avif"/);
  expect(html).toMatch(/<img[^>]+src="\/scenes\/rain-lighthouse\/poster\.jpg"/);
  const videoTag = html.match(/<video[^>]*>/)?.[0] ?? "";
  expect(videoTag).toContain('preload="none"');
  expect(videoTag).toMatch(/muted/);
  expect(videoTag).toMatch(/playsInline/i);
  expect(videoTag).not.toMatch(/autoplay/i);

  await page.goto("/?boot=off&weather=rain");
  await expect(page.getByTestId("scene")).toHaveAttribute("data-weather", "rain");
  await expect(layerVideo(page)).toHaveCount(1);
  await expect.poll(() => videoSources(page)).toContain("/scenes/rain-lighthouse/loop-1080.mp4");

  expect(errors).toEqual([]);
});

test("wideo: AV1 przed H.264, wczytana tylko bieżąca scena, start z wybranego źródła", async ({ page, request }) => {
  const errors = collectConsoleErrors(page);
  const html = await (await request.get("/?weather=cloudy&time=day")).text();
  const video = html.match(/<video[^>]*>(.*?)<\/video>/)?.[1] ?? "";
  // SSR: oba źródła, AV1 pierwsze (decyzja o kodeku zapada w przeglądarce, przed wczytaniem).
  expect(video).toMatch(/<source src="\/scenes\/cloudy-lighthouse\/loop-1080\.av1\.mp4" type="video\/mp4; codecs=&quot;av01[^"]*"\/><source src="\/scenes\/cloudy-lighthouse\/loop-1080\.mp4"/);

  const media: string[] = [];
  page.on("request", (req) => {
    if (/\/scenes\/.+\.(mp4|avif|webp|jpg)/.test(req.url())) media.push(new URL(req.url()).pathname);
  });
  await page.goto("/?boot=off&weather=cloudy&time=day");
  const el = layerVideo(page);
  await expect(el).toHaveAttribute("data-handoff", "video", { timeout: 15_000 });
  const { codec, currentSrc } = await el.evaluate((v: HTMLVideoElement) => ({ codec: v.dataset.codec, currentSrc: v.currentSrc }));
  // Przeglądarka gra to źródło, które wybrał kod (AV1 tylko przy sprzętowym dekodowaniu).
  expect(new URL(currentSrc).pathname).toBe(codec === "av1" ? "/scenes/cloudy-lighthouse/loop-1080.av1.mp4" : "/scenes/cloudy-lighthouse/loop-1080.mp4");
  // Tylko pliki bieżącej sceny, jeden poster i jedno wideo.
  expect(media.every((path) => path.startsWith("/scenes/cloudy-lighthouse/"))).toBe(true);
  expect(new Set(media.filter((path) => path.endsWith(".mp4"))).size).toBe(1);
  expect(new Set(media.filter((path) => /poster/.test(path))).size).toBe(1);
  expect(errors).toEqual([]);
});

test("wideo zakrywa poster dopiero na klatce 0", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/?boot=off");
  const video = layerVideo(page);
  await expect(video).toHaveAttribute("data-handoff", "video", { timeout: 15_000 });
  const firstFrameTime = Number(await video.getAttribute("data-first-frame-time"));
  expect(firstFrameTime).toBeGreaterThanOrEqual(0);
  expect(firstFrameTime).toBeLessThan(0.5 / 24);
  expect(await video.evaluate((el: HTMLVideoElement) => el.muted && !el.paused)).toBe(true);
  expect(errors).toEqual([]);
});

for (const [weather, folder] of [
  ["sunny", "sunny-lighthouse"],
  ["cloudy", "cloudy-lighthouse"],
] as const) {
  test(`?weather=${weather} wybiera właściwą scenę`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/?boot=off&weather=${weather}&time=day`);
    await expect(page.getByTestId("scene")).toHaveAttribute("data-weather", weather);
    await expect.poll(() => videoSources(page)).toContain(`/scenes/${folder}/loop-1080.mp4`);
    await expect(layerPoster(page)).toHaveAttribute("src", `/scenes/${folder}/poster.jpg`);
    expect(errors).toEqual([]);
  });
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("brak pudełka");
  return b;
}

test("poster i wideo mają identyczne pudełko kadru, przeliczane przy zmianie rozmiaru okna", async ({
  page,
}) => {
  await page.goto("/?boot=off");
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 800, height: 800 },
    { width: 1600, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    // Czekamy, aż ResizeObserver przeliczy pudełko dla nowego rozmiaru okna.
    await expect
      .poll(async () => {
        const b = await box(layerVideo(page));
        return b.x + b.width >= viewport.width && b.y + b.height >= viewport.height;
      })
      .toBe(true);
    const poster = await box(layerPoster(page));
    const video = await box(layerVideo(page));
    expect(video).toEqual(poster);
    expect(video.x).toBeLessThanOrEqual(0);
    expect(video.y).toBeLessThanOrEqual(0);
    expect(video.x + video.width).toBeGreaterThanOrEqual(viewport.width);
    expect(video.y + video.height).toBeGreaterThanOrEqual(viewport.height);
    expect(Math.abs(video.width / video.height - 16 / 9)).toBeLessThan(0.01);
  }
});

test("pudełko kadru ze skryptu inline = pudełko po hydracji (poster nie przeskakuje)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/?boot=off");
  await expect(layerVideo(page)).toHaveAttribute("data-handoff", "video", { timeout: 15_000 });
  const { inline, hydrated } = await page.evaluate(() => {
    const names = ["--scene-width", "--scene-height", "--scene-left", "--scene-top"];
    const root = getComputedStyle(document.documentElement);
    const stage = (document.querySelector("[data-testid=scene]") as HTMLElement).style;
    return {
      inline: names.map((n) => root.getPropertyValue(n).trim()),
      hydrated: names.map((n) => stage.getPropertyValue(n).trim()),
    };
  });
  expect(inline).toEqual(["1366px", "768px", "0px", "0px"]);
  expect(hydrated).toEqual(inline);
  expect(errors).toEqual([]);
});

test("prefers-reduced-motion: przekazanie i zmiana sceny działają z krótkimi przenikaniami", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Pora dnia stała: nocą sunny/cloudy mają plansze nocne (zadanie 6b).
  await page.goto("/?boot=off&weather=rain&time=day");
  await expect(layerVideo(page)).toHaveAttribute("data-handoff", "video", { timeout: 15_000 });

  await page.getByRole("link", { name: "cloudy" }).click();
  const layers = page.locator("[data-testid=scene-layer]");
  await expect(layers).toHaveCount(1, { timeout: 3000 });
  await expect(layers.first()).toHaveAttribute("data-video", "cloudy");
});

test("przełączenie sceny przenika bez przesunięcia layoutu", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/?boot=off&weather=rain&time=day");
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

  // W trakcie przejścia żyją dokładnie dwie warstwy…
  const layers = page.locator("[data-testid=scene-layer]");
  await expect(layers).toHaveCount(2);
  // …a po przenikaniu zostaje tylko nowa scena.
  await expect(layers).toHaveCount(1, { timeout: 8000 });
  await expect(layers.first()).toHaveAttribute("data-video", "sunny");

  expect(await scene.boundingBox()).toEqual(before);
  const cls = await page.evaluate(() => (window as Window & { __cls?: number }).__cls ?? 0);
  expect(cls).toBe(0);
  expect(errors).toEqual([]);
});
