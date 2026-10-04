import { expect, test, type Page } from "@playwright/test";

/**
 * Okno Rynków na zapasowym źródle (`?markets=fallback`: bez WebSocketu Binance). Odpowiedzi
 * `/api/markets`, `/api/markets/history` i `/api/fx` podmienione – test nie zależy od sieci.
 */
const PRICES = { BTC: 85_000, ETH: 2_700, SOL: 120, XRP: 1.5, ADA: 0.25 } as const;

async function mockMarkets(page: Page) {
  const now = new Date();
  const history: string[] = [];
  await page.route("**/api/markets", (route) =>
    route.fulfill({
      json: {
        source: "coingecko",
        fetchedAt: now.toISOString(),
        quotes: Object.entries(PRICES).map(([symbol, priceUsd]) => ({
          symbol,
          priceUsd,
          change24hPct: symbol === "ETH" ? -1.5 : 3.2,
          high24hUsd: priceUsd * 1.02,
          low24hUsd: priceUsd * 0.97,
          updatedAt: now.toISOString(),
          source: "coingecko",
        })),
      },
    }),
  );
  await page.route("**/api/markets/history?*", (route) => {
    const url = new URL(route.request().url());
    const symbol = url.searchParams.get("symbol") as keyof typeof PRICES;
    const range = url.searchParams.get("range") ?? "1D";
    history.push(`${symbol}:${range}`);
    const step = { "1D": 15, "1T": 60, "1M": 240 }[range] ?? 15;
    const points = Array.from({ length: 48 }, (_, i) => ({
      t: now.getTime() - (47 - i) * step * 60_000,
      p: PRICES[symbol] * (1 + Math.sin(i / 5) * 0.02),
    }));
    return route.fulfill({ json: { symbol, range, points, fetchedAt: now.toISOString(), source: "binance" } });
  });
  await page.route("**/api/fx", (route) =>
    route.fulfill({
      json: {
        base: "USD",
        quote: "PLN",
        rate: 3.9,
        effectiveDate: now.toISOString().slice(0, 10),
        validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        fetchedAt: now.toISOString(),
      },
    }),
  );
  return history;
}

test("okno Rynków: zapasowe źródło, wybór waluty, zakres wykresu, alert w panelu i w pigułce", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  const history = await mockMarkets(page);
  await page.goto("/?boot=off&weather=rain&time=day&markets=fallback");

  // Z docka (klawiaturą: w trybie dev przełącznik scen przykrywa róg docka); adres `?app=rynki`.
  const icon = page.getByRole("navigation", { name: "Aplikacje" }).getByRole("button", { name: "Rynki" });
  await icon.focus();
  await page.keyboard.press("Enter");
  const win = page.getByRole("dialog", { name: "Rynki" });
  await expect(win).toBeVisible();
  await expect(page).toHaveURL(/[?&]app=rynki(&|$)/);

  // Stan i źródło widoczne w kapsule pod oknem.
  const status = win.getByTestId("markets-status");
  await expect(status).toHaveAttribute("data-status", "fallback");
  await expect(status).toContainText("Zapasowe źródło");
  await expect(status).toContainText("CoinGecko");

  // Lista 5 walut, BTC wybrany; wybór ETH zmienia szczegół.
  const list = win.getByRole("listbox", { name: "Kryptowaluty" });
  await expect(list.getByRole("option")).toHaveCount(5);
  await expect(list.getByRole("option", { selected: true })).toHaveAttribute("data-symbol", "BTC");
  await list.getByRole("option", { name: /^Ethereum/ }).click();
  await expect(list.getByRole("option", { selected: true })).toHaveAttribute("data-symbol", "ETH");
  const detail = win.getByTestId("market-detail");
  await expect(detail.getByRole("heading", { name: /Ethereum/ })).toBeVisible();
  await expect(detail).toContainText("2700,00 $");
  await expect(detail).toContainText("−1,50%");

  // Zakres: 1M pobiera historię miesiąca, wykres przerysowuje się dla nowego zakresu.
  await detail.getByRole("radio", { name: /^1M/ }).click();
  await expect(detail.getByTestId("market-chart")).toHaveAttribute("data-range", "1M");
  expect(history).toContain("ETH:1M");
  await expect(detail.getByRole("table")).toHaveCount(1);

  // Waluta: PLN po kursie NBP, kurs w kapsule.
  await win.getByRole("radio", { name: /^PLN/ }).click();
  await expect(detail).toContainText("10 530,00 zł");
  await expect(win).toContainText(/kurs NBP z \d\d\.\d\d/);
  await win.getByRole("radio", { name: /^USD/ }).click();

  // Alert z panelu bocznego: ETH poniżej 2500 $ czeka, ETH powyżej 2000 $ odpala od razu (pigułka).
  const aside = win.getByTestId("markets-aside");
  const form = aside.getByRole("form", { name: "Nowy alert cenowy" });
  await form.getByRole("radio", { name: "Ethereum" }).click();
  await form.getByRole("radio", { name: "poniżej" }).click();
  await form.getByTestId("alert-threshold").fill("2 500");
  await form.getByRole("button", { name: "Dodaj alert" }).click();
  await expect(aside.getByRole("listitem")).toHaveCount(1);
  await expect(aside.getByRole("listitem")).toContainText("Ethereum");

  await form.getByRole("radio", { name: "powyżej" }).click();
  await form.getByTestId("alert-threshold").fill("2000");
  await form.getByRole("button", { name: "Dodaj alert" }).click();
  await expect(page.getByTestId("pill")).toContainText("Alert: ETH powyżej 2000,00 $");

  // Zakładka „Alerty”: jeden aktywny, jeden wykonany; panel boczny znika.
  await win.getByRole("tab", { name: "Alerty" }).click();
  const tab = win.getByTestId("markets-alerts");
  await expect(tab.getByRole("region", { name: /Aktywne/ }).getByTestId("market-alert")).toHaveCount(1);
  await expect(tab.getByRole("region", { name: /Wykonane/ }).getByTestId("market-alert")).toContainText("wykonany");
  await expect(aside).toHaveCount(0);
});
