/**
 * Dotyk zamiast najechania (układ mobilny): ekran dotykowy nie ma hover, więc podgląd dnia
 * w kuli pokazuje pierwsze dotknięcie, a przypięcie całej sceny – drugie dotknięcie tego samego dnia.
 */

export type DayTapAction = "preview" | "select";

export interface DayTapContext {
  /** Dzień, którego podgląd jest teraz w kuli (po poprzednim dotknięciu); null = brak. */
  previewed: string | null;
  /** Dzień pokazany w scenie (przypięty albo dziś). */
  shown: string;
  /** Dzisiejsza data w strefie lokalizacji. */
  today: string;
}

export function dayTapAction(tapped: string, { previewed, shown, today }: DayTapContext): DayTapAction {
  // Dzień już w scenie i „dziś” (powrót do bieżącego widoku) działają od razu, jak klik myszą.
  if (tapped === shown || tapped === today) return "select";
  return tapped === previewed ? "select" : "preview";
}
