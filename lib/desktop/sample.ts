/**
 * Dane przykładowe pulpitu (lista, przypomnienia, przepis, utwór). Jedno miejsce,
 * żeby łatwo je podmienić na store'y i prawdziwe źródła w kolejnych zadaniach.
 */

export interface ShoppingItem {
  id: string;
  name: string;
  done: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  at: Date;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: string[];
}

export interface Track {
  title: string;
}

export const SAMPLE_SHOPPING: ShoppingItem[] = [
  { id: "jajka", name: "Jajka", done: false },
  { id: "mleko", name: "Mleko", done: true },
  { id: "chleb", name: "Chleb", done: true },
  { id: "maslo", name: "Masło", done: true },
];

export const SAMPLE_RECIPE: Recipe = {
  id: "zupa-pomidorowa",
  title: "Zupa pomidorowa",
  ingredients: ["Pomidory", "Śmietana", "Bazylia"],
};

export const SAMPLE_TRACK: Track = { title: "Deszcz nad morzem" };

const MINUTE = 60_000;

function ceilTo(at: number, stepMinutes: number): Date {
  const step = stepMinutes * MINUTE;
  return new Date(Math.ceil(at / step) * step);
}

/**
 * Przypomnienia liczone od chwili renderu, żeby pigułka zawsze miała coś „za chwilę”:
 * pierwsze za 15 min, kolejne na pełną godzinę i pół godziny później.
 */
export function sampleReminders(now: Date): Reminder[] {
  const t = now.getTime();
  return [
    { id: "dentysta", title: "Dentysta", at: new Date(Math.floor(t / MINUTE) * MINUTE + 15 * MINUTE) },
    { id: "zespol", title: "Zespół", at: ceilTo(t + 2 * 60 * MINUTE, 60) },
    { id: "paczka", title: "Paczka", at: ceilTo(t + 5 * 60 * MINUTE, 30) },
  ];
}

/** Najbliższe przypomnienie, które jeszcze trwa (do 5 min po czasie pokazujemy „Teraz”). */
export function nextReminder(reminders: Reminder[], now: Date): Reminder | null {
  const grace = 5 * MINUTE;
  return (
    [...reminders]
      .filter((r) => r.at.getTime() + grace > now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
  );
}

/** Dopisuje składniki, których jeszcze nie ma na liście (bez względu na wielkość liter). */
export function addIngredients(items: ShoppingItem[], ingredients: string[]): ShoppingItem[] {
  const existing = new Set(items.map((item) => item.name.toLocaleLowerCase("pl")));
  const added = ingredients
    .filter((name) => !existing.has(name.toLocaleLowerCase("pl")))
    .map((name) => ({ id: `item-${name.toLocaleLowerCase("pl")}`, name, done: false }));
  return [...items, ...added];
}
