/**
 * Tekst komendy: dopasowanie bez wielkości liter i bez polskich znaków („usun” = „usuń”).
 * `fold` zamienia znak na znak, więc indeksy dopasowania w złożonym tekście wskazują te same
 * miejsca w oryginale (tytuł przypomnienia i nazwy produktów zachowują pisownię użytkownika).
 */

const FOLD: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

export function fold(text: string): string {
  let out = "";
  for (const char of text.toLocaleLowerCase("pl")) out += FOLD[char] ?? char;
  return out;
}

/** Spacje zwinięte, bez kropki/wykrzyknika/pytajnika na końcu. */
export function cleanInput(raw: string): string {
  return raw.replace(/[\s ]+/g, " ").trim().replace(/[.!?…]+$/u, "").trim();
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pl") + text.slice(1);
}

/**
 * Para „oryginał + złożony” z wycinaniem fragmentów: wycięty fragment zamienia się na spacje
 * w obu wersjach (indeksy kolejnych dopasowań się nie przesuwają).
 */
export class Phrase {
  src: string;
  key: string;

  constructor(src: string) {
    this.src = src;
    this.key = fold(src);
  }

  /** Pierwsze dopasowanie `pattern` w złożonym tekście; wycina je, gdy `cut`. */
  take(pattern: RegExp, cut = true): RegExpExecArray | null {
    const match = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(this.key);
    if (match && cut) this.cut(match.index, match.index + match[0].length);
    return match;
  }

  cut(start: number, end: number): void {
    const blank = " ".repeat(end - start);
    this.src = this.src.slice(0, start) + blank + this.src.slice(end);
    this.key = this.key.slice(0, start) + blank + this.key.slice(end);
  }

  /** Pozostały tekst (oryginalna pisownia), spacje zwinięte. */
  rest(): string {
    return this.src.replace(/\s+/g, " ").trim();
  }
}
