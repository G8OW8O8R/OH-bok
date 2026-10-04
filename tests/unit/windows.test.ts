import { describe, expect, it } from "vitest";
import { appFromSlug } from "@/lib/windows/apps";
import {
  cascadeOffset,
  clampOffset,
  dragBounds,
  fromSaved,
  initialOffset,
  shouldDismissSheet,
  toSaved,
} from "@/lib/windows/position";
import {
  closeWindow,
  cycleWindows,
  focusWindow,
  openWindow,
  topWindow,
  visibleWindows,
  windowLayer,
} from "@/lib/windows/stack";
import { closeNavigation, parseAppParam, searchWithStack, stackFromSearch } from "@/lib/windows/url";

describe("stos okien", () => {
  it("otwarcie dokłada na wierzch, ponowne otwarcie podnosi zamiast dublować", () => {
    const one = openWindow([], "weather");
    expect(one).toEqual(["weather"]);
    expect(openWindow(one, "weather")).toBe(one);
    const two = openWindow(one, "shopping");
    expect(two).toEqual(["weather", "shopping"]);
    expect(openWindow(two, "weather")).toEqual(["shopping", "weather"]);
    expect(topWindow(two)).toBe("shopping");
    expect(topWindow([])).toBeNull();
  });

  it("fokus podnosi tylko otwarte okno, zamknięcie usuwa", () => {
    const stack = ["weather", "shopping"] as const;
    expect(focusWindow(stack, "weather")).toEqual(["shopping", "weather"]);
    expect(focusWindow(stack, "reminders")).toBe(stack);
    expect(closeWindow(stack, "weather")).toEqual(["shopping"]);
    expect(closeWindow(stack, "reminders")).toBe(stack);
  });

  it("F6 przechodzi przez wszystkie okna, Shift+F6 w drugą stronę", () => {
    let stack: readonly ("weather" | "shopping" | "reminders")[] = ["weather", "shopping", "reminders"];
    const tops: string[] = [];
    for (let i = 0; i < 3; i++) {
      stack = cycleWindows(stack);
      tops.push(topWindow(stack) ?? "");
    }
    expect(tops).toEqual(["weather", "shopping", "reminders"]);
    expect(cycleWindows(["weather", "shopping", "reminders"], true)).toEqual(["reminders", "weather", "shopping"]);
    expect(cycleWindows(["weather"])).toEqual(["weather"]);
  });

  it("warstwy rosną w górę stosu; na telefonie widać tylko okno z wierzchu", () => {
    const stack = ["weather", "shopping"] as const;
    expect(windowLayer(stack, "weather", 40)).toBe(40);
    expect(windowLayer(stack, "shopping", 40)).toBe(41);
    expect(visibleWindows(stack, true)).toEqual(["shopping"]);
    expect(visibleWindows(stack, false)).toBe(stack);
  });
});

describe("adres okien", () => {
  it("czyta polskie nazwy, pomija nieznane i powtórzenia (ostatnie wygrywa)", () => {
    expect(parseAppParam("pogoda")).toEqual(["weather"]);
    expect(parseAppParam("pogoda,lista")).toEqual(["weather", "shopping"]);
    expect(parseAppParam("lista,rynki,Pogoda,lista")).toEqual(["weather", "shopping"]);
    expect(parseAppParam("")).toEqual([]);
    expect(parseAppParam(null)).toEqual([]);
    expect(appFromSlug("weather")).toBeNull();
    expect(stackFromSearch("?weather=rain&app=przypomnienia")).toEqual(["reminders"]);
  });

  it("zapis zachowuje pozostałe parametry i czytelny przecinek", () => {
    expect(searchWithStack("?weather=rain&boot=off", ["weather", "shopping"])).toBe("?weather=rain&boot=off&app=pogoda,lista");
    expect(searchWithStack("?app=pogoda&weather=rain", [])).toBe("?weather=rain");
    expect(searchWithStack("?app=pogoda", [])).toBe("");
    expect(searchWithStack("", ["reminders"])).toBe("?app=przypomnienia");
    // Zapis i odczyt to ta sama droga.
    expect(stackFromSearch(searchWithStack("?time=day", ["shopping", "weather"]))).toEqual(["shopping", "weather"]);
  });

  it("zamknięcie cofa historię tylko dla okna, które ten wpis otworzył i które jest na wierzchu", () => {
    expect(closeNavigation(["weather"], "weather", "weather")).toBe("back");
    // Okno z linku: wpis nie jest nasz.
    expect(closeNavigation(["weather"], "weather", undefined)).toBe("replace");
    // Zamykane okno nie jest na wierzchu: „wstecz” zamknęłoby inne.
    expect(closeNavigation(["weather", "shopping"], "weather", "shopping")).toBe("replace");
  });
});

describe("pozycje okien", () => {
  const viewport = { width: 1440, height: 900 };
  const insets = { top: 16, bottom: 96, side: 16 };
  const size = { width: 1000, height: 600 };

  it("zakres przeciągania trzyma całe okno w obszarze; okno większe od obszaru stoi na środku", () => {
    expect(dragBounds(size, viewport, insets)).toEqual({ left: -204, right: 204, top: -94, bottom: 94 });
    expect(dragBounds({ width: 1500, height: 900 }, viewport, insets)).toEqual({ left: -0, right: 0, top: -0, bottom: 0 });
    const bounds = dragBounds(size, viewport, insets);
    expect(clampOffset({ x: 500, y: -500 }, bounds)).toEqual({ x: 204, y: -94 });
  });

  it("zapamiętana pozycja jest względna: okno przy prawej krawędzi zostaje przy niej na innym ekranie", () => {
    const bounds = dragBounds(size, viewport, insets);
    const saved = toSaved({ x: 204, y: -47 }, bounds);
    expect(saved).toEqual({ fx: 1, fy: -0.5 });
    const wide = dragBounds(size, { width: 1920, height: 1080 }, insets);
    expect(fromSaved(saved, wide)).toEqual({ x: wide.right, y: -0.5 * wide.bottom });
    // Brak swobody w osi (okno na całą wysokość) = środek, bez dzielenia przez zero.
    expect(toSaved({ x: 0, y: 0 }, { left: 0, right: 0, top: 0, bottom: 0 })).toEqual({ fx: 0, fy: 0 });
  });

  it("bez zapamiętanej pozycji kolejne okna schodzą kaskadą, w granicach ekranu", () => {
    const bounds = dragBounds(size, viewport, insets);
    expect(cascadeOffset(0, 32, bounds)).toEqual({ x: 0, y: 0 });
    expect(cascadeOffset(1, 32, bounds)).toEqual({ x: 32, y: 32 });
    expect(cascadeOffset(5, 32, bounds)).toEqual({ x: 160, y: 94 });
    expect(initialOffset({ fx: -1, fy: 1 }, 3, 32, bounds)).toEqual({ x: -204, y: 94 });
    expect(initialOffset(null, 1, 32, bounds)).toEqual({ x: 32, y: 32 });
  });

  it("arkusz zamyka się po przeciągnięciu o ćwierć wysokości albo szybkim ruchu w dół", () => {
    expect(shouldDismissSheet(240, 0, 844)).toBe(true);
    expect(shouldDismissSheet(120, 0, 844)).toBe(false);
    expect(shouldDismissSheet(60, 1200, 844)).toBe(true);
    // Drgnięcie palca przy tapnięciu nie zamyka, nawet szybkie.
    expect(shouldDismissSheet(10, 2000, 844)).toBe(false);
    expect(shouldDismissSheet(-200, 0, 844)).toBe(false);
  });
});
