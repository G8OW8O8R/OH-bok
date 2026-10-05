import { z } from "zod";

/**
 * Źródła wiadomości: publiczne kanały RSS po polsku, osobno Polska i świat.
 * Pokazujemy wyłącznie nagłówek, nazwę źródła, godzinę i link do artykułu – nigdy treści.
 * Warunki korzystania z kanałów sprawdzone 2026-10-05.
 */

export const NEWS_CATEGORIES = ["polska", "swiat"] as const;
export const newsCategorySchema = z.enum(NEWS_CATEGORIES);
export type NewsCategory = z.infer<typeof newsCategorySchema>;

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = { polska: "Polska", swiat: "Świat" };

export interface NewsSource {
  id: string;
  /** Nazwa przy nagłówku. */
  name: string;
  category: NewsCategory;
  url: string;
  /** Domena artykułów: link spoza niej (albo nie http/https) odpada. */
  domain: string;
  /**
   * Kanał podaje czas lokalny z błędnym przesunięciem (Bankier.pl: czas warszawski zawsze z `+0100`,
   * także latem – pozycje „z przyszłości”). Wtedy liczy się sama godzina na zegarze w tej strefie.
   */
  wallClockZone?: string;
}

export const NEWS_SOURCES: readonly NewsSource[] = [
  { id: "rmf24-polska", name: "RMF24", category: "polska", url: "https://www.rmf24.pl/fakty/polska/feed", domain: "rmf24.pl" },
  { id: "bankier", name: "Bankier.pl", category: "polska", url: "https://www.bankier.pl/rss/wiadomosci.xml", domain: "bankier.pl", wallClockZone: "Europe/Warsaw" },
  { id: "rmf24-swiat", name: "RMF24", category: "swiat", url: "https://www.rmf24.pl/fakty/swiat/feed", domain: "rmf24.pl" },
  { id: "euronews", name: "Euronews", category: "swiat", url: "https://pl.euronews.com/rss", domain: "euronews.com" },
  { id: "dw", name: "DW", category: "swiat", url: "https://rss.dw.com/rdf/rss-pol-all", domain: "dw.com" },
];
