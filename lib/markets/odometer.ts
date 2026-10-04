/**
 * Licznik cen: przy zmianie ceny przewijają się tylko cyfry, które się zmieniły.
 * Teksty wyrównujemy od prawej (końcówka „,09 $” stoi w miejscu), więc pozycja liczona od końca
 * jest stałym kluczem komórki – React zachowuje komórkę, a animuje tylko zmieniony znak.
 */
export interface DigitCell {
  /** Stały klucz: pozycja od prawej. */
  key: string;
  char: string;
  isDigit: boolean;
  /** Cyfra różna od znaku na tej samej pozycji (od prawej) w poprzednim tekście. */
  changed: boolean;
  /** Znak na tej pozycji w poprzednim tekście (null = nie było). */
  previous: string | null;
}

const DIGIT = /\d/;

export function diffDigits(previous: string | null, next: string): DigitCell[] {
  const cells: DigitCell[] = [];
  for (let i = 0; i < next.length; i += 1) {
    const fromRight = next.length - 1 - i;
    const char = next.charAt(i);
    const isDigit = DIGIT.test(char);
    const index = previous === null ? -1 : previous.length - 1 - fromRight;
    const before = previous !== null && index >= 0 ? previous.charAt(index) : null;
    cells.push({
      key: `r${fromRight}`,
      char,
      isDigit,
      changed: isDigit && previous !== null && before !== char,
      previous: before,
    });
  }
  return cells;
}

export type PriceDirection = "up" | "down";

/** Kierunek zmiany ceny (mignięcie wiersza, kierunek przewijania cyfr); null = bez zmiany. */
export function priceDirection(previous: number | null | undefined, next: number): PriceDirection | null {
  if (previous == null || previous === next) return null;
  return next > previous ? "up" : "down";
}
