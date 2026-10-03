import { expect, test, type Page } from "@playwright/test";
import { weatherDataSchema } from "../../lib/weather/schema";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const arc = (page: Page) => page.getByTestId("weather-arc");

test("API: znormalizowane dane, nagłówki diagnostyczne, 400 dla błędnych współrzędnych", async ({ request }) => {
  const response = await request.get("/api/weather?lat=54.35&lon=18.65");
  expect(response.status()).toBe(200);
  expect(["hit", "miss", "stale", "demo"]).toContain(response.headers()["x-obok-cache"]);
  expect(["open-meteo", "demo"]).toContain(response.headers()["x-obok-provider"]);
  expect(weatherDataSchema.safeParse(await response.json()).success).toBe(true);

  const invalid = await request.get("/api/weather?lat=100&lon=0");
  expect(invalid.status()).toBe(400);
});

test("bez override scena odpowiada prawdziwej pogodzie; atrybucja Open-Meteo jest widoczna", async ({
  page,
  request,
}) => {
  const errors = collectConsoleErrors(page);
  const api = weatherDataSchema.parse(await (await request.get("/api/weather")).json());

  await page.goto("/?boot=off");
  await expect(page.getByTestId("scene")).toHaveAttribute("data-weather", api.current.state);
  await expect(page.getByTestId("weather-place")).toHaveText("Gdańsk");
  const attribution = page.getByRole("link", { name: "Open-Meteo.com" });
  await expect(attribution).toBeVisible();
  await expect(attribution).toHaveAttribute("href", "https://open-meteo.com/");
  expect(errors).toEqual([]);
});

test("override ?weather= ma pierwszeństwo przed prawdziwą pogodą", async ({ page }) => {
  await page.goto("/?boot=off&weather=storm");
  await expect(page.getByTestId("scene")).toHaveAttribute("data-weather", "storm");
  await expect(arc(page)).toContainText("Scena wymuszona: burza");
});

test("odmowa geolokalizacji nie psuje strony: zostaje Gdańsk i czytelny komunikat", async ({ browser }) => {
  const context = await browser.newContext(); // bez uprawnień: przeglądarka odmawia
  const page = await context.newPage();
  const errors = collectConsoleErrors(page);
  await page.goto("/?boot=off");

  await arc(page).getByRole("button", { name: "Użyj mojej lokalizacji" }).click();
  await expect(arc(page)).toContainText("Brak zgody na lokalizację");
  await expect(page.getByTestId("weather-place")).toHaveText("Gdańsk");
  await expect(page.getByTestId("scene")).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "obok-loc")).toBeUndefined();
  expect(errors).toEqual([]);
  await context.close();
});

test("zgoda na lokalizację: pogoda dla użytkownika, ciasteczko z zaokrągloną pozycją, SSR przy kolejnej wizycie", async ({
  browser,
}) => {
  const context = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: { latitude: 52.229676, longitude: 21.012229 },
  });
  const page = await context.newPage();
  await page.goto("/?boot=off");

  // Zgoda już jest, więc lokalizacja pobiera się bez klikania (i bez okna uprawnień).
  await expect(page.getByTestId("weather-place")).toHaveText("Twoja lokalizacja");
  const cookie = (await context.cookies()).find((c) => c.name === "obok-loc");
  expect(cookie?.value).toBe("52.23,21.01");

  // Kolejna wizyta: serwer od razu renderuje pogodę dla zapisanej lokalizacji.
  const html = await (await context.request.get("/")).text();
  expect(html).toContain("Twoja lokalizacja");
  await context.close();
});

test("wyłączenie sieci: dane z pamięci z oznaczeniem, powrót sieci: dane na żywo", async ({ page, context }) => {
  await page.goto("/?boot=off");
  // Jeśli SSR dostał nieświeży wpis cache, klient po chwili pobiera świeży.
  await expect(arc(page)).toHaveAttribute("data-source", "live", { timeout: 10_000 });
  // Ostatnie dobre dane trafiają do localStorage po hydracji.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("obok-weather")?.includes('"lastGood":{') ?? false))
    .toBe(true);

  await context.setOffline(true);
  await expect(arc(page)).toHaveAttribute("data-source", "cache");
  await expect(page.getByTestId("weather-badge")).toHaveText(/^z pamięci · \d{2}:\d{2}$/);
  await expect(page.getByTestId("scene")).toBeVisible();

  await context.setOffline(false);
  await expect(arc(page)).toHaveAttribute("data-source", "live");
});
