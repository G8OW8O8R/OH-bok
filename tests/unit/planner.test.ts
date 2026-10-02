import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addReminder,
  completeReminder,
  defaultReminderInput,
  isDue,
  nextReminder,
  nextSlot,
  parseReminderInput,
  pendingReminders,
  removeReminder,
  snoozeReminder,
  starterReminders,
  type Reminder,
} from "@/lib/reminders/reminders";
import { addItems, remainingCount, removeItem, splitItems, toggleItem, STARTER_ITEMS } from "@/lib/shopping/list";
import { formatWhen, minuteOfDay } from "@/lib/time";
import { glueShortWords } from "@/lib/typography";
import { REMINDERS_STORAGE_KEY, nextWakeAt, useRemindersStore } from "@/store/reminders";
import { SHOPPING_STORAGE_KEY, useShoppingStore } from "@/store/shopping";

// Store'y tworzą storage przy imporcie: localStorage musi istnieć wcześniej.
const storage = vi.hoisted(() => {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    },
  });
  return map;
});

const TZ = "Europe/Warsaw";
// 29.09.2026, Warszawa = UTC+2.
const local = (h: number, m = 0, day = 29) => new Date(Date.UTC(2026, 8, day, h - 2, m));
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("lista zakupów", () => {
  it("dodaje, trymuje, pomija duplikaty bez względu na wielkość liter", () => {
    const items = addItems([], ["  Jajka ", "jajka", "", "Mleko   2%"], ids());
    expect(items.map((i) => i.name)).toEqual(["Jajka", "Mleko 2%"]);
  });

  it("dodanie kupionej pozycji przywraca ją do „do kupienia”", () => {
    const start = [{ id: "a", name: "Mleko", done: true }];
    expect(addItems(start, ["mleko"], ids())).toEqual([{ id: "a", name: "Mleko", done: false }]);
  });

  it("odhaczanie, usuwanie, podział i licznik", () => {
    let items = addItems([], ["A", "B", "C"], ids());
    items = toggleItem(items, "id-2");
    expect(splitItems(items).todo.map((i) => i.name)).toEqual(["A", "C"]);
    expect(splitItems(items).done.map((i) => i.name)).toEqual(["B"]);
    expect(remainingCount(items)).toBe(2);
    items = removeItem(items, "id-1");
    expect(items.map((i) => i.name)).toEqual(["B", "C"]);
  });

  it("dane startowe: 3 z 4 kupione", () => {
    expect(STARTER_ITEMS.filter((i) => i.done)).toHaveLength(3);
  });
});

describe("przypomnienia", () => {
  const make = (id: string, at: Date, done = false): Reminder => ({ id, title: id, at: at.toISOString(), done });

  it("najbliższe = pierwsze niezakończone, także po terminie", () => {
    const list = [make("b", local(12)), make("a", local(9)), make("c", local(10), true)];
    expect(nextReminder(list)?.id).toBe("a");
    expect(pendingReminders(list).map((r) => r.id)).toEqual(["a", "b"]);
    expect(isDue(make("a", local(9)), local(9, 1))).toBe(true);
    expect(isDue(make("a", local(9)), local(8, 59))).toBe(false);
  });

  it("pigułka zawsze zgadza się z listą: najbliższe jest pierwsze na osi czasu po każdej operacji", () => {
    let list: Reminder[] = [];
    const check = () => expect(nextReminder(list)?.id ?? null).toBe(pendingReminders(list)[0]?.id ?? null);
    list = addReminder(list, { title: "B", at: local(14) }, "b");
    check();
    list = addReminder(list, { title: "A", at: local(10) }, "a");
    check();
    expect(nextReminder(list)?.id).toBe("a");
    list = snoozeReminder(list, "a", local(10, 1));
    check();
    expect(nextReminder(list)?.id).toBe("a");
    expect(list.find((r) => r.id === "a")?.at).toBe(local(10, 11).toISOString());
    list = completeReminder(list, "a");
    check();
    expect(nextReminder(list)?.id).toBe("b");
    list = removeReminder(list, "b");
    check();
    expect(nextReminder(list)).toBeNull();
  });

  it("drzemka = teraz + 10 min i przypomnienie znów czeka", () => {
    const list = snoozeReminder([make("a", local(9), true)], "a", local(9, 5));
    expect(list[0]).toMatchObject({ done: false, at: local(9, 15).toISOString() });
  });

  it("walidacja formularza", () => {
    const now = local(9);
    expect(parseReminderInput({ title: "  ", at: local(10) }, now)).toMatchObject({ ok: false });
    expect(parseReminderInput({ title: "X", at: new Date(NaN) }, now)).toMatchObject({ ok: false });
    expect(parseReminderInput({ title: "X", at: local(8) }, now)).toEqual({
      ok: false,
      error: "Termin musi być w przyszłości.",
    });
    expect(parseReminderInput({ title: " Dentysta ", at: local(10) }, now)).toEqual({ ok: true, title: "Dentysta", at: local(10) });
  });
});

describe("pory przypomnień na start", () => {
  const hhmm = (d: Date) => {
    const m = minuteOfDay(d, TZ);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  it("zaokrągla do pełnych 30 min", () => {
    expect(hhmm(nextSlot(local(14, 10), TZ))).toBe("14:30");
    expect(hhmm(nextSlot(local(14, 30), TZ))).toBe("14:30");
    expect(hhmm(nextSlot(local(14, 31), TZ))).toBe("15:00");
  });

  it("poza 8:00–20:00 przechodzi na najbliższe 8:00 (jutro, gdy trzeba)", () => {
    const night = nextSlot(local(1, 0, 30), TZ);
    expect(hhmm(night)).toBe("08:00");
    expect(night.getTime()).toBe(local(8, 0, 30).getTime());
    const evening = nextSlot(local(20, 10), TZ);
    expect(evening.getTime()).toBe(local(8, 0, 30).getTime());
    expect(hhmm(nextSlot(local(20, 0), TZ))).toBe("20:00");
  });

  it.each([0, 3, 7, 12, 19, 21, 23])("start o %i:10: wszystkie trzy w rozsądnych godzinach, rosnąco", (hour) => {
    const now = local(hour, 10);
    const list = starterReminders(now, TZ);
    const times = list.map((r) => Date.parse(r.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const r of list) {
      const m = minuteOfDay(new Date(r.at), TZ);
      expect(m).toBeGreaterThanOrEqual(8 * 60);
      expect(m).toBeLessThanOrEqual(20 * 60);
      expect(m % 30).toBe(0);
      expect(Date.parse(r.at)).toBeGreaterThan(now.getTime());
    }
  });

  it("domyślny termin formularza", () => {
    expect(defaultReminderInput(local(14, 10), TZ)).toEqual({ date: "2026-09-29", time: "15:00" });
  });

  it("etykiety terminów", () => {
    const now = local(9);
    expect(formatWhen(local(14, 30), now, TZ)).toBe("14:30");
    expect(formatWhen(local(8, 0, 30), now, TZ)).toBe("jutro 08:00");
    expect(formatWhen(local(8, 0, 2 + 29), now, TZ)).toMatch(/^[A-ZŚ][a-zł]+ 08:00$/);
  });
});

describe("typografia", () => {
  it("krótkie słowa łączone z następnym twardą spacją", () => {
    expect(glueShortWords("Wieczór bez deszczu, jutro do 12°.")).toBe("Wieczór bez deszczu, jutro do 12°.");
    expect(glueShortWords("Od 14:00 pada, weź parasol.")).toBe("Od 14:00 pada, weź parasol.");
    expect(glueShortWords("Dziś słonecznie")).toBe("Dziś słonecznie");
  });
});

describe("zapis w localStorage (walidacja Zod przy odczycie)", () => {
  beforeEach(() => {
    storage.clear();
    useShoppingStore.setState({ items: [], seeded: false });
    useRemindersStore.setState({ reminders: [], seeded: false });
  });

  it("poprawny zapis wraca po odświeżeniu", async () => {
    storage.set(
      SHOPPING_STORAGE_KEY,
      JSON.stringify({ state: { items: [{ id: "x", name: "Ser", done: true }], seeded: true }, version: 1 }),
    );
    await useShoppingStore.persist.rehydrate();
    expect(useShoppingStore.getState().items).toEqual([{ id: "x", name: "Ser", done: true }]);
  });

  it("uszkodzony zapis = stan domyślny, nie crash", async () => {
    storage.set(SHOPPING_STORAGE_KEY, "{nie json");
    storage.set(
      REMINDERS_STORAGE_KEY,
      JSON.stringify({ state: { reminders: [{ id: "", title: 5, at: "jutro", done: "tak" }], seeded: true }, version: 1 }),
    );
    await useShoppingStore.persist.rehydrate();
    await useRemindersStore.persist.rehydrate();
    expect(useShoppingStore.getState().items).toEqual([]);
    expect(useRemindersStore.getState().reminders).toEqual([]);
    expect(useRemindersStore.getState().seeded).toBe(false);
  });

  it("dane startowe tylko raz; zmiany trafiają do zapisu", () => {
    useShoppingStore.getState().seedIfFirstVisit();
    expect(useShoppingStore.getState().items).toHaveLength(4);
    useShoppingStore.getState().remove("starter-jajka");
    useShoppingStore.getState().seedIfFirstVisit();
    expect(useShoppingStore.getState().items).toHaveLength(3);
    expect(JSON.parse(storage.get(SHOPPING_STORAGE_KEY) ?? "{}").state.items).toHaveLength(3);
  });

  it("nextWakeAt: najbliższy przyszły termin niezakończonego przypomnienia", () => {
    const now = local(9).getTime();
    useRemindersStore.setState({
      reminders: [
        { id: "a", title: "A", at: local(8).toISOString(), done: false },
        { id: "b", title: "B", at: local(11).toISOString(), done: false },
        { id: "c", title: "C", at: local(10).toISOString(), done: true },
      ],
    });
    expect(nextWakeAt(now)).toBe(local(11).getTime());
    expect(nextWakeAt(local(12).getTime())).toBeNull();
  });
});
