import { describe, expect, it } from "vitest";
import { clampSlot, earliestSlot, presetAt, stepValue } from "@/lib/reminders/presets";

const TZ = "Europe/Warsaw";
// Warszawa w październiku 2026 do 25.10 = UTC+2.
const local = (h: number, m = 0, day = 2) => new Date(Date.UTC(2026, 9, day, h - 2, m));

describe("szybkie terminy", () => {
  it("za 15 min i za 1 h – od pełnej minuty", () => {
    const now = new Date(local(14, 7).getTime() + 42_000);
    expect(presetAt("15m", now, TZ)).toEqual(local(14, 22));
    expect(presetAt("1h", now, TZ)).toEqual(local(15, 7));
  });

  it("wieczorem: dziś 19:00, od 19:00 jutro 19:00", () => {
    expect(presetAt("evening", local(18, 59), TZ)).toEqual(local(19));
    expect(presetAt("evening", local(19, 0), TZ)).toEqual(local(19, 0, 3));
    expect(presetAt("evening", local(23, 30), TZ)).toEqual(local(19, 0, 3));
  });

  it("jutro 9:00, także tuż po północy i na przełomie miesiąca", () => {
    expect(presetAt("tomorrow", local(14), TZ)).toEqual(local(9, 0, 3));
    expect(presetAt("tomorrow", local(0, 10), TZ)).toEqual(local(9, 0, 3));
    expect(presetAt("tomorrow", new Date("2026-10-31T12:00:00Z"), TZ).toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });

  it("zmiana czasu: przejście na czas zimowy", () => {
    // 24.10 (UTC+2) → 25.10 (UTC+1).
    expect(presetAt("tomorrow", new Date("2026-10-24T12:00:00Z"), TZ).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(presetAt("evening", new Date("2026-10-25T10:00:00Z"), TZ).toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });

  it("inna strefa", () => {
    expect(presetAt("evening", new Date("2026-10-02T12:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-10-02T23:00:00.000Z",
    );
  });
});

describe("wybór godziny", () => {
  it("najwcześniejszy termin: następna 5-minutówka, przez północ", () => {
    expect(earliestSlot(local(14, 2), TZ)).toEqual({ date: "2026-10-02", time: "14:05" });
    expect(earliestSlot(local(14, 4), TZ)).toEqual({ date: "2026-10-02", time: "14:05" });
    expect(earliestSlot(local(14, 5), TZ)).toEqual({ date: "2026-10-02", time: "14:10" });
    expect(earliestSlot(local(23, 58), TZ)).toEqual({ date: "2026-10-03", time: "00:00" });
  });

  it("godzina z przeszłości przesuwa się na najwcześniejszą", () => {
    const now = local(14, 2);
    expect(clampSlot({ date: "2026-10-02", time: "13:00" }, now, TZ)).toEqual({ date: "2026-10-02", time: "14:05" });
    expect(clampSlot({ date: "2026-10-02", time: "16:00" }, now, TZ)).toEqual({ date: "2026-10-02", time: "16:00" });
    expect(clampSlot({ date: "2026-10-03", time: "08:00" }, now, TZ)).toEqual({ date: "2026-10-03", time: "08:00" });
  });

  it("krok z zawinięciem", () => {
    expect(stepValue(23, 1, 1, 23)).toBe(0);
    expect(stepValue(0, -1, 1, 23)).toBe(23);
    expect(stepValue(55, 1, 5, 55)).toBe(0);
    expect(stepValue(0, -1, 5, 55)).toBe(55);
    expect(stepValue(10, 3, 5, 55)).toBe(25);
  });
});
