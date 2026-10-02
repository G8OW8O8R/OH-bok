import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareMonths,
  formatDayLabel,
  formatMonth,
  monthGrid,
  moveDate,
  shiftMonth,
  weekdayIndex,
} from "@/lib/calendar";
import { formatDue, zonedDate } from "@/lib/time";

describe("kalendarz", () => {
  it("siatka: 6 tygodni od poniedziałku, dni spoza miesiąca puste", () => {
    // Październik 2026 zaczyna się w czwartek.
    const grid = monthGrid({ year: 2026, month: 9 });
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    const days = grid.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    expect(days.at(-1)).toBe("2026-10-31");
  });

  it("luty w roku przestępnym i miesiąc zaczynający się w poniedziałek", () => {
    expect(monthGrid({ year: 2028, month: 1 }).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid({ year: 2027, month: 1 })[0]?.[0]).toBe("2027-02-01");
  });

  it("arytmetyka dat bez wpływu zmiany czasu", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(compareMonths({ year: 2026, month: 9 }, { year: 2026, month: 10 })).toBeLessThan(0);
    expect(weekdayIndex("2026-10-05")).toBe(0);
    expect(weekdayIndex("2026-10-04")).toBe(6);
  });

  it("polskie nazwy", () => {
    expect(formatMonth({ year: 2026, month: 9 })).toBe("Październik 2026");
    expect(formatDayLabel("2026-10-02")).toBe("piątek, 2 października 2026");
  });

  it("klawiatura: strzałki, Home/End, PageUp/PageDown, nigdy przed dziś", () => {
    const min = "2026-10-02";
    expect(moveDate("2026-10-07", "ArrowLeft", min)).toBe("2026-10-06");
    expect(moveDate("2026-10-07", "ArrowRight", min)).toBe("2026-10-08");
    expect(moveDate("2026-10-07", "ArrowDown", min)).toBe("2026-10-14");
    expect(moveDate("2026-10-07", "ArrowUp", min)).toBe(min);
    expect(moveDate("2026-10-07", "Home", min)).toBe("2026-10-05");
    expect(moveDate("2026-10-07", "End", min)).toBe("2026-10-11");
    expect(moveDate("2026-10-31", "PageDown", min)).toBe("2026-11-30");
    expect(moveDate("2026-11-15", "PageUp", min)).toBe("2026-10-15");
    expect(moveDate(min, "ArrowLeft", min)).toBe(min);
    expect(moveDate(min, "Enter", min)).toBeNull();
  });
});

describe("czas w strefie", () => {
  const TZ = "Europe/Warsaw";

  it("czas lokalny strefy → chwila (lato, zima, inna strefa)", () => {
    expect(zonedDate("2026-10-02", "19:00", TZ).toISOString()).toBe("2026-10-02T17:00:00.000Z");
    expect(zonedDate("2026-12-01", "09:00", TZ).toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(zonedDate("2026-10-02", "19:00", "America/New_York").toISOString()).toBe("2026-10-02T23:00:00.000Z");
    expect(Number.isNaN(zonedDate("", "10:00", TZ).getTime())).toBe(true);
  });

  it("zmiana czasu: godzina nieistniejąca przesuwa się o godzinę dalej", () => {
    // 29.03.2026: 02:00 → 03:00.
    expect(zonedDate("2026-03-29", "02:30", TZ).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedDate("2026-03-29", "03:00", TZ).toISOString()).toBe("2026-03-29T01:00:00.000Z");
    // Dzień po zmianie na czas zimowy (25.10.2026).
    expect(zonedDate("2026-10-26", "09:00", TZ).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("podsumowanie terminu", () => {
    const now = new Date("2026-10-02T08:00:00Z");
    expect(formatDue(new Date("2026-10-02T12:30:00Z"), now, TZ)).toBe("dziś 14:30");
    expect(formatDue(new Date("2026-10-03T07:00:00Z"), now, TZ)).toBe("jutro 09:00");
    expect(formatDue(new Date("2026-10-09T08:00:00Z"), now, TZ)).toBe("Pt, 9 paź · 10:00");
  });
});
