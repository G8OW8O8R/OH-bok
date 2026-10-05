import { describe, expect, it } from "vitest";
import { parseCommand, reminderTitle, type Command } from "@/lib/commands/parse";
import { formatCommandWhen, isAction, searchApps } from "@/lib/commands/search";
import { fold } from "@/lib/commands/text";
import { addChange, findItem, restoreItem, revertAdd, type ShoppingItem } from "@/lib/shopping/list";

const TZ = "Europe/Warsaw";
// 2 października 2026 to piątek; Warszawa do 25.10 = UTC+2.
const local = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h - 2, m));
const NOW = local(2, 10, 7);

function parse(text: string, now = NOW): Command {
  return parseCommand(text, { now, timeZone: TZ });
}

function reminder(text: string, now = NOW): { title: string; at: Date } {
  const command = parse(text, now);
  if (command.kind !== "reminder") throw new Error(`${text} → ${command.kind}`);
  return { title: command.title, at: command.at };
}

describe("parser: przypomnienia", () => {
  it("przypomnij mi jutro o 9 o dentyście → Dentysta, jutro 9:00 (makieta)", () => {
    expect(reminder("przypomnij mi jutro o 9 o dentyście")).toEqual({ title: "Dentysta", at: local(3, 9) });
  });

  it("za 15 minut wyjąć pranie – od pełnej minuty", () => {
    expect(reminder("za 15 minut wyjąć pranie")).toEqual({ title: "Wyjąć pranie", at: local(2, 10, 22) });
  });

  it("w piątek o 14:30 spotkanie – dziś piątek, godzina jeszcze przed nami", () => {
    expect(reminder("w piątek o 14:30 spotkanie")).toEqual({ title: "Spotkanie", at: local(2, 14, 30) });
  });

  it("w piątek po 14:30 – za tydzień", () => {
    expect(reminder("w piątek o 14:30 spotkanie", local(2, 16)).at).toEqual(local(9, 14, 30));
  });

  it("wieczorem zadzwonić do mamy – dziś 19:00, po 19:00 jutro (jak szybki wybór)", () => {
    expect(reminder("wieczorem zadzwonić do mamy")).toEqual({ title: "Zadzwonić do mamy", at: local(2, 19) });
    expect(reminder("wieczorem zadzwonić do mamy", local(2, 20)).at).toEqual(local(3, 19));
  });

  it("pojutrze bez godziny – rano 9:00", () => {
    expect(reminder("przypomnij mi pojutrze o rachunkach")).toEqual({ title: "Rachunki", at: local(4, 9) });
  });

  it("we wtorek rano – najbliższy wtorek 9:00", () => {
    expect(reminder("we wtorek rano trening").at).toEqual(local(6, 9));
  });

  it("za godzinę, za pół godziny, za 2 h, za kwadrans", () => {
    expect(reminder("za godzinę wyjść z psem").at).toEqual(local(2, 11, 7));
    expect(reminder("za pół godziny herbata").at).toEqual(local(2, 10, 37));
    expect(reminder("za 2 h odebrać paczkę").at).toEqual(local(2, 12, 7));
    expect(reminder("za kwadrans spotkanie").at).toEqual(local(2, 10, 22));
  });

  it("o 9:30 i o 9.30 – godzina minęła, więc jutro", () => {
    expect(reminder("przypomnij mi o 9:30 o lekach").at).toEqual(local(3, 9, 30));
    expect(reminder("przypomnij o 9.30 leki").at).toEqual(local(3, 9, 30));
  });

  it("o 5 po 5:00 rano = 17:00 dziś", () => {
    expect(reminder("przypomnij mi o 5 o praniu")).toEqual({ title: "Pranie", at: local(2, 17) });
  });

  it("o 7 wieczorem = 19:00, o 3 po południu = 15:00", () => {
    expect(reminder("jutro o 7 wieczorem kino").at).toEqual(local(3, 19));
    expect(reminder("przypomnij mi o 3 po południu odebrać dzieci").at).toEqual(local(2, 15));
  });

  it("dzień tygodnia w różnych przypadkach: w środę, w niedzielę, w sobotę", () => {
    expect(reminder("w środę o 8 basen").at).toEqual(local(7, 8));
    expect(reminder("w niedzielę obiad u babci").at).toEqual(local(4, 9));
    expect(reminder("w sobotę o 10 fryzjer").at).toEqual(local(3, 10));
  });

  it("tytuł: łączniki „żeby”, „że”, nieznany miejscownik", () => {
    expect(reminder("przypomnij mi jutro, żeby kupić kwiaty").title).toBe("Kupić kwiaty");
    expect(reminderTitle("o kotku sąsiadki")).toBe("Pamiętać o kotku sąsiadki");
    expect(reminderTitle("mi o spotkaniu z Anią")).toBe("Spotkanie z Anią");
  });

  it("bez terminu albo bez treści – podpowiedź, nie zgadywanie", () => {
    expect(parse("przypomnij mi o dentyście")).toMatchObject({ kind: "incomplete", intent: "reminder" });
    expect(parse("przypomnij mi jutro")).toMatchObject({ kind: "incomplete", message: "O czym przypomnieć?" });
  });

  it("dziś o godzinie, która minęła (bez wariantu popołudniowego) – błąd", () => {
    expect(parse("dziś o 13 obiad", local(2, 22))).toMatchObject({ kind: "incomplete", intent: "reminder" });
  });

  it("zmiana czasu na zimowy: jutro o 9 po 24.10", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(reminder("przypomnij mi jutro o 9 o dentyście", now).at.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
});

describe("parser: lista zakupów", () => {
  it("dodaj mleko i jajka", () => {
    expect(parse("dodaj mleko i jajka")).toEqual({ kind: "addItems", items: ["Mleko", "Jajka"] });
  });

  it("przecinki, „oraz”, „do listy”", () => {
    expect(parse("dopisz chleb, masło oraz ser do listy")).toEqual({ kind: "addItems", items: ["Chleb", "Masło", "Ser"] });
    expect(parse("kup sól")).toEqual({ kind: "addItems", items: ["Sól"] });
  });

  it("usuń chleb z listy", () => {
    expect(parse("usuń chleb z listy")).toEqual({ kind: "removeItem", item: "Chleb" });
    expect(parse("Skreśl masło")).toEqual({ kind: "removeItem", item: "Masło" });
  });

  it("dopasowanie pozycji po rdzeniu, bez fałszywych trafień", () => {
    const items: ShoppingItem[] = [
      { id: "a", name: "Chleb", done: false },
      { id: "b", name: "Masło", done: false },
      { id: "c", name: "Jajka", done: true },
    ];
    expect(findItem(items, "chleba")?.id).toBe("a");
    expect(findItem(items, "jajko")?.id).toBe("c");
    expect(findItem(items, "maślanka")).toBeNull();
  });

  it("cofnięcie dodania i usunięcia", () => {
    const before: ShoppingItem[] = [{ id: "a", name: "Mleko", done: true }];
    const after: ShoppingItem[] = [{ id: "a", name: "Mleko", done: false }, { id: "n", name: "Jajka", done: false }];
    const change = addChange(before, after);
    expect(change).toEqual({ created: ["n"], reopened: ["a"] });
    expect(revertAdd(after, change)).toEqual(before);
    expect(restoreItem([{ id: "x", name: "Ser", done: false }], before[0]!, 0).map((i) => i.id)).toEqual(["a", "x"]);
  });
});

describe("parser: aplikacje i wyszukiwanie", () => {
  it("otwórz rynki, pogoda, lista", () => {
    expect(parse("otwórz rynki")).toEqual({ kind: "openApp", app: "markets" });
    expect(parse("pogoda")).toEqual({ kind: "openApp", app: "weather" });
    expect(parse("lista")).toEqual({ kind: "openApp", app: "shopping" });
    expect(parse("pokaż przypomnienia")).toEqual({ kind: "openApp", app: "reminders" });
  });

  it("wyszukiwanie po początku nazwy, bez polskich znaków", () => {
    expect(searchApps("ryn")).toEqual(["markets"]);
    expect(searchApps("lis zak")).toEqual(["shopping"]);
    expect(searchApps("gielda")).toEqual(["markets"]);
    expect(searchApps("p")).toEqual([]);
  });
});

describe("parser: rynki", () => {
  it("ile kosztuje bitcoin / eth / samo „solana”", () => {
    expect(parse("ile kosztuje bitcoin")).toEqual({ kind: "price", symbol: "BTC" });
    expect(parse("Jaki jest kurs ETH?")).toEqual({ kind: "price", symbol: "ETH" });
    expect(parse("solana")).toEqual({ kind: "price", symbol: "SOL" });
  });

  it("powiadom mnie, gdy BTC spadnie poniżej 60 000", () => {
    expect(parse("powiadom mnie, gdy BTC spadnie poniżej 60 000")).toEqual({
      kind: "alert",
      symbol: "BTC",
      condition: "below",
      threshold: 60000,
      currency: null,
    });
  });

  it("alert powyżej w złotych, „tys.”, ułamek", () => {
    expect(parse("daj znać jak ethereum przekroczy 15 tys. zł")).toMatchObject({ condition: "above", threshold: 15000, currency: "PLN" });
    expect(parse("alert gdy XRP powyżej 2,5 $")).toMatchObject({ symbol: "XRP", threshold: 2.5, currency: "USD" });
  });

  it("alert bez progu – podpowiedź", () => {
    expect(parse("powiadom mnie, gdy bitcoin spadnie")).toMatchObject({ kind: "incomplete", intent: "alert" });
  });
});

describe("parser: pogoda", () => {
  it("jaka pogoda jutro → prognoza, bez przypinania", () => {
    expect(parse("jaka pogoda jutro")).toEqual({ kind: "weather", date: "2026-10-03", pin: false });
    expect(parse("czy w środę będzie padać")).toEqual({ kind: "weather", date: "2026-10-07", pin: false });
    expect(parse("jaka jest pogoda")).toEqual({ kind: "weather", date: "2026-10-02", pin: false });
  });

  it("pokaż czwartek → przypięcie dnia", () => {
    expect(parse("pokaż czwartek")).toEqual({ kind: "weather", date: "2026-10-08", pin: true });
    expect(parse("pokaż pogodę na jutro")).toEqual({ kind: "weather", date: "2026-10-03", pin: true });
  });
});

describe("parser: muzyka", () => {
  const music = (text: string) => {
    const command = parse(text);
    return command.kind === "music" ? command.action : command.kind;
  };

  it("włącz muzykę i warianty → play", () => {
    for (const text of ["włącz muzykę", "Puść muzykę!", "zagraj jakąś muzykę", "graj", "wznów", "muzyka", "włącz mi piosenkę"]) {
      expect(music(text), text).toBe("play");
    }
  });

  it("coś spokojnego → calm", () => {
    for (const text of ["coś spokojnego", "Puść coś spokojnego", "włącz spokojną muzykę", "coś do relaksu", "muzyka do relaksu"]) {
      expect(music(text), text).toBe("calm");
    }
  });

  it("pauza → pause", () => {
    for (const text of ["pauza", "Pauza.", "zatrzymaj muzykę", "wstrzymaj", "stop", "wyłącz muzykę", "przestań grać"]) {
      expect(music(text), text).toBe("pause");
    }
  });

  it("następny → next", () => {
    for (const text of ["następny", "Następny utwór", "następna piosenka", "pomiń", "dalej", "przełącz na następny utwór", "inna piosenka"]) {
      expect(music(text), text).toBe("next");
    }
  });

  it("komenda muzyki jest akcją Spotlightu", () => {
    expect(isAction(parse("pauza"))).toBe(true);
  });

  it("nie przechwytuje innych komend", () => {
    expect(parse("otwórz rynki").kind).toBe("openApp");
    expect(parse("dodaj płytę z muzyką").kind).toBe("addItems");
    expect(parse("przypomnij mi jutro o 9 o muzyce").kind).toBe("reminder");
    expect(parse("następny wtorek").kind).not.toBe("music");
    expect(parse("stop wojnie").kind).not.toBe("music");
  });
});

describe("parser: reszta", () => {
  it("niezrozumiałe i puste → unknown", () => {
    expect(parse("opowiedz mi dowcip")).toEqual({ kind: "unknown" });
    expect(parse("   ")).toEqual({ kind: "unknown" });
  });

  it("akcje vs informacje", () => {
    expect(isAction(parse("jaka pogoda jutro"))).toBe(false);
    expect(isAction(parse("pokaż czwartek"))).toBe(true);
    expect(isAction(parse("ile kosztuje bitcoin"))).toBe(false);
    expect(isAction(parse("dodaj mleko"))).toBe(true);
  });

  it("termin w wierszu wyniku", () => {
    expect(formatCommandWhen(local(3, 9), NOW, TZ)).toBe("jutro, 09:00");
    expect(formatCommandWhen(local(2, 14, 30), NOW, TZ)).toBe("dziś, 14:30");
    expect(formatCommandWhen(local(6, 9), NOW, TZ)).toBe("wtorek, 09:00");
    expect(formatCommandWhen(local(12, 9), NOW, TZ)).toBe("12.10, 09:00");
  });

  it("fold zachowuje długość (indeksy w oryginale)", () => {
    const text = "Przypomnij mi o dentyście, żółw";
    expect(fold(text)).toHaveLength(text.length);
    expect(fold("ŻÓŁĆ")).toBe("zolc");
  });
});
