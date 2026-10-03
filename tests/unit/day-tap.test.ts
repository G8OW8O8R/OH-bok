import { describe, expect, it } from "vitest";
import { dayTapAction } from "@/lib/weather/day-tap";

const TODAY = "2026-10-04";

describe("dotyk dnia prognozy", () => {
  it("pierwsze dotknięcie innego dnia = podgląd, drugie = przypięcie", () => {
    const context = { previewed: null, shown: TODAY, today: TODAY };
    expect(dayTapAction("2026-10-06", context)).toBe("preview");
    expect(dayTapAction("2026-10-06", { ...context, previewed: "2026-10-06" })).toBe("select");
  });

  it("dotknięcie innego dnia w trakcie podglądu przenosi podgląd", () => {
    expect(dayTapAction("2026-10-07", { previewed: "2026-10-06", shown: TODAY, today: TODAY })).toBe("preview");
  });

  it("dzień już w scenie i „dziś” działają od razu (powrót do bieżącego widoku)", () => {
    expect(dayTapAction("2026-10-06", { previewed: null, shown: "2026-10-06", today: TODAY })).toBe("select");
    expect(dayTapAction(TODAY, { previewed: null, shown: "2026-10-06", today: TODAY })).toBe("select");
  });
});
