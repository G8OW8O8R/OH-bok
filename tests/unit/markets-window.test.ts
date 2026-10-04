import { describe, expect, it } from "vitest";
import { parseThreshold } from "@/lib/markets/alerts";
import { chartGeometry, nearestIndex, pointLabel, timeTicks, withLivePrice } from "@/lib/markets/chart";
import { diffDigits, priceDirection } from "@/lib/markets/odometer";
import type { HistoryPoint } from "@/lib/markets/schema";
import { dragBounds } from "@/lib/windows/position";

const changed = (previous: string | null, next: string) =>
  diffDigits(previous, next)
    .filter((cell) => cell.changed)
    .map((cell) => `${cell.previous}→${cell.char}`);

describe("licznik: które cyfry się zmieniły", () => {
  it("przewija tylko zmienione cyfry, separatory i waluta stoją", () => {
    expect(changed("85 323,09 $", "85 323,19 $")).toEqual(["0→1"]);
    expect(changed("85 323,09 $", "85 399,99 $")).toEqual(["2→9", "3→9", "0→9"]);
    expect(diffDigits("85 323,09 $", "85 323,09 $").some((cell) => cell.changed)).toBe(false);
  });

  it("wyrównuje od prawej: dłuższa liczba ma nową cyfrę z lewej, klucze końcówki są stałe", () => {
    const cells = diffDigits("999,50 $", "1000,50 $");
    expect(cells.map((cell) => cell.char).join("")).toBe("1000,50 $");
    expect(cells[0]).toMatchObject({ char: "1", previous: null, changed: true });
    expect(cells.at(-1)?.key).toBe("r0");
    expect(diffDigits("1,50 $", "11,50 $").at(-1)?.key).toBe(diffDigits("1,50 $", "1,50 $").at(-1)?.key);
  });

  it("pierwsze wyświetlenie niczego nie przewija", () => {
    expect(changed(null, "85 323,09 $")).toEqual([]);
  });

  it("kierunek zmiany ceny", () => {
    expect(priceDirection(null, 5)).toBeNull();
    expect(priceDirection(5, 5)).toBeNull();
    expect(priceDirection(5, 6)).toBe("up");
    expect(priceDirection(6, 5)).toBe("down");
  });
});

describe("wykres: skala i celownik", () => {
  const box = { width: 220, height: 120, insetX: 10, insetTop: 10, insetBottom: 10 };
  const series: HistoryPoint[] = [
    { t: 0, p: 100 },
    { t: 50, p: 150 },
    { t: 100, p: 200 },
  ];

  it("min–max na wysokość, czas liniowo na szerokość (z zapasem)", () => {
    const geometry = chartGeometry(series, box);
    expect(geometry?.points.map(({ x, y }) => [x, y])).toEqual([
      [10, 110],
      [110, 60],
      [210, 10],
    ]);
    expect(geometry?.line).toBe("M10 110L110 60L210 10");
    expect(geometry?.area).toBe("M10 110L110 60L210 10L210 120L10 120Z");
    expect([geometry?.min, geometry?.max]).toEqual([100, 200]);
  });

  it("płaska seria na środku, za mało punktów = brak wykresu", () => {
    const flat = chartGeometry([{ t: 0, p: 5 }, { t: 1, p: 5 }], box);
    expect(flat?.points.map((point) => point.y)).toEqual([60, 60]);
    expect(chartGeometry([{ t: 0, p: 5 }], box)).toBeNull();
  });

  it("celownik: najbliższy punkt (także poza zakresem)", () => {
    const points = [{ x: 10 }, { x: 110 }, { x: 210 }];
    expect(nearestIndex(points, -40)).toBe(0);
    expect(nearestIndex(points, 59)).toBe(0);
    expect(nearestIndex(points, 61)).toBe(1);
    expect(nearestIndex(points, 500)).toBe(2);
    expect(nearestIndex([], 10)).toBe(-1);
  });

  it("ostatni punkt idzie za ceną na żywo: w trwającej świecy podmiana, potem nowy punkt", () => {
    const step = 15 * 60_000; // 1D = świece 15 min
    const candles: HistoryPoint[] = [{ t: 0, p: 1 }, { t: step, p: 2 }];
    expect(withLivePrice(candles, "1D", { t: step + 60_000, p: 3 })).toEqual([{ t: 0, p: 1 }, { t: step, p: 3 }]);
    expect(withLivePrice(candles, "1D", { t: 2 * step + 1, p: 4 })).toEqual([...candles, { t: 2 * step + 1, p: 4 }]);
    expect(withLivePrice(candles, "1D", { t: 10, p: 9 })).toBe(candles); // starsze notowanie
    expect(withLivePrice(candles, "1D", null)).toBe(candles);
  });
});

describe("wykres: oś czasu w strefie użytkownika", () => {
  const zone = "Europe/Warsaw";

  it("1D: pełne godziny podzielne przez 6", () => {
    const from = Date.parse("2026-10-03T19:10:00Z"); // 21:10 w Warszawie
    const to = from + 24 * 60 * 60 * 1000;
    expect(timeTicks("1D", from, to, zone).map((tick) => tick.label)).toEqual(["0:00", "6:00", "12:00", "18:00"]);
  });

  it("1T: północ każdego dnia, skrót dnia tygodnia", () => {
    const from = Date.parse("2026-09-27T19:00:00Z");
    const to = Date.parse("2026-10-04T19:00:00Z");
    const ticks = timeTicks("1T", from, to, zone);
    expect(ticks.map((tick) => tick.label)).toEqual(["pon", "wt", "śr", "czw", "pt", "sob", "niedz"]);
    expect(new Date(ticks[0]?.t ?? 0).toISOString()).toBe("2026-09-27T22:00:00.000Z");
  });

  it("1M: poniedziałki", () => {
    const from = Date.parse("2026-09-04T19:00:00Z");
    const to = Date.parse("2026-10-04T19:00:00Z");
    expect(timeTicks("1M", from, to, zone).map((tick) => tick.label)).toEqual(["7 wrz", "14 wrz", "21 wrz", "28 wrz"]);
  });

  it("podpis celownika bez kropki skrótu przed przecinkiem", () => {
    const t = Date.parse("2026-10-01T20:00:00Z");
    expect(pointLabel(t, "1D", zone)).toBe("22:00");
    expect(pointLabel(t, "1T", zone)).toBe("czw, 1 paź, 22:00");
  });
});

describe("próg alertu z pola tekstowego", () => {
  it.each([
    ["85000", 85000],
    ["85 000,50", 85000.5],
    ["85 000,5 $", 85000.5],
    ["0.25", 0.25],
    ["1 900 zł", 1900],
  ])("%s → %d", (text, value) => {
    expect(parseThreshold(text)).toBe(value);
  });

  it.each(["", "abc", "0", "-5", "1,2,3", "1e5"])("odrzuca „%s”", (text) => {
    expect(parseThreshold(text)).toBeNull();
  });
});

describe("granice okna z panelem bocznym", () => {
  const viewport = { width: 1536, height: 864 };
  const insets = { top: 16, bottom: 100, side: 16 };

  it("panel wystający w lewo zostaje w ekranie (okno przesuwa się w prawo)", () => {
    const size = { width: 990, height: 470 };
    const free = (1536 - 32 - 990) / 2; // 257
    expect(dragBounds(size, viewport, insets, 0).left).toBe(-free);
    const withAside = dragBounds(size, viewport, insets, 284);
    expect(withAside.left).toBe(284 - free);
    expect(withAside.right).toBe(free);
  });

  it("panel szerszy niż wolne miejsce: okno + panel wyśrodkowane razem", () => {
    const bounds = dragBounds({ width: 1300, height: 470 }, viewport, insets, 300);
    expect(bounds.left).toBe(bounds.right);
    expect(bounds.left).toBe(150);
  });
});
