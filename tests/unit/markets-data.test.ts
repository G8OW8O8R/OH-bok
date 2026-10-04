import { describe, expect, it } from "vitest";
import { alertMessage, createAlert, evaluateAlerts, isAlertMet, type AlertInput } from "@/lib/markets/alerts";
import { displayCurrency, formatChange, formatPrice, fromUsd, toUsd } from "@/lib/markets/currency";
import { fxCacheSeconds, isFxFresh, nbpValidUntil, nextBusinessDay, normalizeNbp, usableFx } from "@/lib/markets/fx";
import {
  downsample,
  normalizeBinanceKlines,
  normalizeBinanceMiniTicker,
  normalizeCoinGeckoChart,
  normalizeCoinGeckoMarkets,
} from "@/lib/markets/normalize";
import type { HistoryPoint, Quote } from "@/lib/markets/schema";
import { sparkline } from "@/lib/markets/sparkline";

const NOW = new Date("2026-10-04T15:45:00Z");

/** Spacje w formatach `Intl` (twarde i wąskie) → zwykłe, dla czytelności asercji. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("normalizacja: Binance", () => {
  const message = {
    stream: "btcusdt@miniTicker",
    data: { e: "24hrMiniTicker", E: 1791128700000, s: "BTCUSDT", c: "85329.10", o: "84000.00", h: "85500.00", l: "83900.50", v: "1", q: "2" },
  };

  it("miniTicker → wspólny format ze zmianą 24 h z ceny otwarcia", () => {
    expect(normalizeBinanceMiniTicker(message)).toEqual({
      symbol: "BTC",
      priceUsd: 85329.1,
      change24hPct: 1.58,
      high24hUsd: 85500,
      low24hUsd: 83900.5,
      updatedAt: new Date(1791128700000).toISOString(),
      source: "binance",
    });
  });

  it("odrzuca nieznaną parę, złe liczby i inne zdarzenia", () => {
    expect(normalizeBinanceMiniTicker({ ...message, data: { ...message.data, s: "DOGEUSDT" } })).toBeNull();
    expect(normalizeBinanceMiniTicker({ ...message, data: { ...message.data, c: "abc" } })).toBeNull();
    expect(normalizeBinanceMiniTicker({ ...message, data: { ...message.data, c: "0" } })).toBeNull();
    expect(normalizeBinanceMiniTicker({ ...message, data: { ...message.data, e: "trade" } })).toBeNull();
    expect(normalizeBinanceMiniTicker({ result: null, id: 1 })).toBeNull();
  });

  it("świece → punkty (czas otwarcia, zamknięcie), złe świece pominięte, rosnąco", () => {
    const klines = [
      [1791115200000, "85309.47", "85470.00", "85094.00", "85342.78", "1076.7", 1791129599999, "1", 1, "1", "1", "0"],
      [1791100800000, "85106.01", "85428.01", "85032.99", "85309.46", "1244.2", 1791115199999, "1", 1, "1", "1", "0"],
      [1791129600000, "x", "1", "1", "1"],
    ];
    expect(normalizeBinanceKlines(klines)).toEqual([
      { t: 1791100800000, p: 85309.46 },
      { t: 1791115200000, p: 85342.78 },
    ]);
    expect(normalizeBinanceKlines({ code: 0 })).toEqual([]);
  });
});

describe("normalizacja: CoinGecko", () => {
  it("coins/markets → ten sam format; brakujące pola = null, złe rekordy pominięte", () => {
    const raw = [
      {
        id: "bitcoin",
        current_price: 85324,
        high_24h: 85401,
        low_24h: 84572,
        price_change_percentage_24h: 0.59745,
        last_updated: "2026-10-04T15:43:30.000Z",
      },
      { id: "cardano", current_price: 0.247856, high_24h: null, low_24h: null, price_change_percentage_24h: null, last_updated: null },
      { id: "dogecoin", current_price: 0.1 },
      { id: "ethereum", current_price: "2698" },
    ];
    expect(normalizeCoinGeckoMarkets(raw, NOW)).toEqual<Quote[]>([
      {
        symbol: "BTC",
        priceUsd: 85324,
        change24hPct: 0.6,
        high24hUsd: 85401,
        low24hUsd: 84572,
        updatedAt: "2026-10-04T15:43:30.000Z",
        source: "coingecko",
      },
      {
        symbol: "ADA",
        priceUsd: 0.247856,
        change24hPct: null,
        high24hUsd: null,
        low24hUsd: null,
        updatedAt: NOW.toISOString(),
        source: "coingecko",
      },
    ]);
    expect(normalizeCoinGeckoMarkets({ error: "rate limit" }, NOW)).toEqual([]);
  });

  it("market_chart → punkty, bez cen ≤ 0, rosnąco", () => {
    const raw = { prices: [[2000.4, 11], [1000, 10], [3000, 0]], market_caps: [], total_volumes: [] };
    expect(normalizeCoinGeckoChart(raw)).toEqual([
      { t: 1000, p: 10 },
      { t: 2000, p: 11 },
    ]);
  });

  it("downsample zostawia pierwszy i ostatni punkt", () => {
    const points: HistoryPoint[] = Array.from({ length: 288 }, (_, i) => ({ t: i, p: 100 + i }));
    const result = downsample(points, 96);
    expect(result).toHaveLength(96);
    expect(result[0]).toEqual(points[0]);
    expect(result.at(-1)).toEqual(points.at(-1));
    expect(downsample(points.slice(0, 10), 96)).toHaveLength(10);
  });

  it("sparkline: ścieżka w pudełku i kierunek zmiany", () => {
    const line = sparkline([{ t: 0, p: 10 }, { t: 50, p: 5 }, { t: 100, p: 20 }], 100, 20, 1);
    expect(line).toEqual({ path: "M0 13L50 19L100 1", trend: "up" });
    expect(sparkline([{ t: 0, p: 1 }], 100, 20)).toBeNull();
  });
});

describe("waluty", () => {
  it("przelicza USD ↔ PLN i nie zgaduje bez kursu", () => {
    expect(fromUsd(100, "USD", null)).toBe(100);
    expect(fromUsd(100, "PLN", 3.8881)).toBeCloseTo(388.81);
    expect(fromUsd(100, "PLN", null)).toBeNull();
    expect(toUsd(388.81, "PLN", 3.8881)).toBeCloseTo(100);
    expect(toUsd(1, "PLN", 0)).toBeNull();
  });

  it("PLN bez kursu → USD (łagodna degradacja)", () => {
    expect(displayCurrency("PLN", null)).toBe("USD");
    expect(displayCurrency("PLN", 3.9)).toBe("PLN");
  });

  it("formatuje po polsku: grosze dla cen ≥ 1, cztery miejsca dla tanich monet", () => {
    expect(plain(formatPrice(85329, "USD"))).toBe("85 329,00 $");
    expect(plain(formatPrice(0.247856, "USD"))).toBe("0,2479 $");
    expect(plain(formatPrice(331776.63, "PLN"))).toBe("331 776,63 zł");
    expect(formatChange(1.5)).toBe("+1,50%");
    expect(formatChange(0)).toBe("0,00%");
  });
});

describe("kurs NBP", () => {
  it("następny dzień roboczy omija weekend", () => {
    expect(nextBusinessDay("2026-10-01")).toBe("2026-10-02"); // czw → pt
    expect(nextBusinessDay("2026-10-02")).toBe("2026-10-05"); // pt → pon
    expect(nextBusinessDay("2026-10-03")).toBe("2026-10-05"); // sob → pon
  });

  it("kurs aktualny do 12:30 czasu warszawskiego następnego dnia roboczego (także zimą)", () => {
    expect(nbpValidUntil("2026-10-02").toISOString()).toBe("2026-10-05T10:30:00.000Z"); // CEST
    expect(nbpValidUntil("2026-12-04").toISOString()).toBe("2026-12-07T11:30:00.000Z"); // CET
  });

  it("normalizuje odpowiedź NBP i liczy czas cache", () => {
    const fx = normalizeNbp(
      { table: "A", currency: "dolar amerykański", code: "USD", rates: [{ no: "192/A/NBP/2026", effectiveDate: "2026-10-02", mid: 3.8881 }] },
      NOW,
    );
    expect(fx).toEqual({
      base: "USD",
      quote: "PLN",
      rate: 3.8881,
      effectiveDate: "2026-10-02",
      validUntil: "2026-10-05T10:30:00.000Z",
      fetchedAt: NOW.toISOString(),
    });
    if (!fx) return;
    expect(isFxFresh(fx, NOW)).toBe(true);
    expect(fxCacheSeconds(fx, NOW)).toBe((Date.parse(fx.validUntil) - NOW.getTime()) / 1000);
    // Po terminie (święto, spóźniona tabela): ponowne pytanie po 15 min.
    const late = new Date("2026-10-05T11:00:00Z");
    expect(isFxFresh(fx, late)).toBe(false);
    expect(fxCacheSeconds(fx, late)).toBe(900);
    // Ostatni znany kurs wolno pokazać do 14 dni.
    expect(usableFx(fx, new Date("2026-10-15T00:00:00Z"))).toBe(fx);
    expect(usableFx(fx, new Date("2026-10-17T00:00:00Z"))).toBeNull();
    expect(normalizeNbp({ table: "A", code: "USD", rates: [] }, NOW)).toBeNull();
  });
});

describe("alerty cenowe", () => {
  const quote = (symbol: Quote["symbol"], priceUsd: number, source: Quote["source"] = "binance"): Quote => ({
    symbol,
    priceUsd,
    change24hPct: 0,
    high24hUsd: null,
    low24hUsd: null,
    updatedAt: NOW.toISOString(),
    source,
  });
  const alert = (input: Partial<AlertInput> = {}, id = "a1") =>
    createAlert({ symbol: "BTC", condition: "above", threshold: 70_000, currency: "USD", ...input }, id, NOW);

  it("powyżej / poniżej (próg włącznie)", () => {
    expect(isAlertMet(alert(), 70_000, null)).toBe(true);
    expect(isAlertMet(alert(), 69_999, null)).toBe(false);
    expect(isAlertMet(alert({ condition: "below" }), 69_999, null)).toBe(true);
  });

  it("alert w PLN porównuje cenę przeliczoną kursem, a bez kursu czeka", () => {
    const pln = alert({ currency: "PLN", threshold: 300_000 });
    expect(isAlertMet(pln, 80_000, 3.8881)).toBe(true); // 311 048 zł
    expect(isAlertMet(pln, 75_000, 3.8881)).toBe(false); // 291 607 zł
    expect(isAlertMet(pln, 80_000, null)).toBeNull();
  });

  it("odpala raz, oznacza jako wykonany i nie rusza pozostałych", () => {
    const alerts = [alert(), alert({ symbol: "ETH", threshold: 5000 }, "a2")];
    const first = evaluateAlerts(alerts, { BTC: quote("BTC", 85_000), ETH: quote("ETH", 2700) }, null, NOW);
    expect(first.triggered.map((a) => a.id)).toEqual(["a1"]);
    expect(first.alerts[0]).toMatchObject({ triggeredAt: NOW.toISOString(), triggeredPrice: 85_000 });
    expect(first.alerts[1]).toBe(alerts[1]);

    const second = evaluateAlerts(first.alerts, { BTC: quote("BTC", 90_000) }, null, new Date(NOW.getTime() + 1000));
    expect(second.triggered).toEqual([]);
    expect(second.alerts[0]?.triggeredAt).toBe(NOW.toISOString());
  });

  it("ceny demo i brak notowania nie odpalają alertu", () => {
    const alerts = [alert()];
    expect(evaluateAlerts(alerts, { BTC: quote("BTC", 90_000, "demo") }, null, NOW).triggered).toEqual([]);
    expect(evaluateAlerts(alerts, {}, null, NOW).triggered).toEqual([]);
  });

  it("komunikat w pigułce", () => {
    const fired = evaluateAlerts([alert()], { BTC: quote("BTC", 85_000) }, null, NOW).triggered;
    expect(plain(alertMessage(fired) ?? "")).toBe("Alert: BTC powyżej 70 000,00 $ · teraz 85 000,00 $");
    expect(alertMessage([])).toBeNull();
    const many = evaluateAlerts(
      [alert(), alert({ symbol: "SOL", threshold: 100 }, "a2")],
      { BTC: quote("BTC", 85_000), SOL: quote("SOL", 120) },
      null,
      NOW,
    ).triggered;
    expect(alertMessage(many)).toBe("Alerty: BTC, SOL");
  });
});
