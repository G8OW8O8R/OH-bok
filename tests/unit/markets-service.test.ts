import { describe, expect, it, vi } from "vitest";
import {
  buildBinanceKlinesUrl,
  createLastKnown,
  getFx,
  getHistory,
  getQuotes,
  type MarketsServiceDeps,
} from "@/lib/markets/service";

const NOW = new Date("2026-10-04T15:45:00Z");

function json(body: unknown, date = NOW): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { date: date.toUTCString() } });
}

function deps(fetchImpl: MarketsServiceDeps["fetch"]): MarketsServiceDeps {
  return {
    fetch: fetchImpl,
    now: () => NOW,
    coinGeckoKey: "demo-key",
    quotes: createLastKnown(60 * 60 * 1000),
    history: createLastKnown(24 * 60 * 60 * 1000),
    fx: createLastKnown(14 * 24 * 60 * 60 * 1000),
  };
}

const KLINES = [
  [NOW.getTime() - 900_000, "1", "1", "1", "85000.00", "1", 0, "1", 1, "1", "1", "0"],
  [NOW.getTime(), "1", "1", "1", "85100.00", "1", 0, "1", 1, "1", "1", "0"],
];

describe("getQuotes", () => {
  it("CoinGecko z kluczem w nagłówku i cache 30 s", async () => {
    const fetchMock = vi.fn<MarketsServiceDeps["fetch"]>().mockResolvedValue(json([{ id: "bitcoin", current_price: 85000 }]));
    const result = await getQuotes(deps(fetchMock));
    expect(result).toMatchObject({ cache: "miss", provider: "coingecko" });
    expect(result.data.quotes[0]?.symbol).toBe("BTC");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.next).toEqual({ revalidate: 30, tags: ["markets"] });
    expect(init?.headers).toMatchObject({ "x-cg-demo-api-key": "demo-key" });
  });

  it("awaria: ostatnie dane z pamięci (stale), a bez nich demo", async () => {
    const d = deps(vi.fn<MarketsServiceDeps["fetch"]>().mockResolvedValue(json([{ id: "bitcoin", current_price: 85000 }])));
    await getQuotes(d);
    d.fetch = vi.fn<MarketsServiceDeps["fetch"]>().mockResolvedValue(new Response("", { status: 429 }));
    expect(await getQuotes(d)).toMatchObject({ cache: "stale", provider: "coingecko" });

    const empty = deps(vi.fn<MarketsServiceDeps["fetch"]>().mockRejectedValue(new Error("down")));
    const demo = await getQuotes(empty);
    expect(demo).toMatchObject({ cache: "demo", provider: "demo" });
    expect(demo.data.quotes.every((quote) => quote.source === "demo")).toBe(true);
  });
});

describe("getHistory", () => {
  it("świece Binance z endpointu tylko do danych rynkowych, cache wg zakresu", async () => {
    const fetchMock = vi.fn<MarketsServiceDeps["fetch"]>().mockResolvedValue(json(KLINES));
    const result = await getHistory("BTC", "1T", deps(fetchMock));
    expect(result.provider).toBe("binance");
    expect(result.data.points).toHaveLength(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(buildBinanceKlinesUrl("BTC", "1T"));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=168");
    expect(fetchMock.mock.calls[0]?.[1]?.next).toEqual({ revalidate: 1800, tags: ["markets"] });
  });

  it("Binance zablokowany (451) → CoinGecko przycięty do zakresu", async () => {
    const day = 24 * 60 * 60 * 1000;
    const fetchMock = vi
      .fn<MarketsServiceDeps["fetch"]>()
      .mockResolvedValueOnce(new Response("", { status: 451 }))
      .mockResolvedValueOnce(json({ prices: [[NOW.getTime() - 2 * day, 1], [NOW.getTime() - 3600_000, 2], [NOW.getTime(), 3]] }));
    const result = await getHistory("ETH", "1D", deps(fetchMock));
    expect(result.provider).toBe("coingecko");
    expect(result.data.source).toBe("coingecko");
    expect(result.data.points.map((point) => point.p)).toEqual([2, 3]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/coins/ethereum/market_chart?vs_currency=usd&days=1");
  });

  it("oba źródła nie działają → demo", async () => {
    const result = await getHistory("SOL", "1M", deps(vi.fn<MarketsServiceDeps["fetch"]>().mockRejectedValue(new Error("x"))));
    expect(result).toMatchObject({ cache: "demo", provider: "demo" });
    expect(result.data.points).toHaveLength(180);
  });
});

describe("getFx", () => {
  const NBP = { table: "A", currency: "dolar amerykański", code: "USD", rates: [{ no: "192/A/NBP/2026", effectiveDate: "2026-10-02", mid: 3.8881 }] };

  it("kurs NBP, a po awarii ostatni znany; bez niego null", async () => {
    const d = deps(vi.fn<MarketsServiceDeps["fetch"]>().mockResolvedValue(json(NBP)));
    expect((await getFx(d))?.data.rate).toBe(3.8881);
    d.fetch = vi.fn<MarketsServiceDeps["fetch"]>().mockRejectedValue(new Error("down"));
    expect(await getFx(d)).toMatchObject({ cache: "stale", data: { rate: 3.8881 } });
    expect(await getFx(deps(vi.fn<MarketsServiceDeps["fetch"]>().mockRejectedValue(new Error("down"))))).toBeNull();
  });
});
