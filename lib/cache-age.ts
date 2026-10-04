/**
 * Status cache z wieku odpowiedzi (nagłówek `x-obok-cache`). Cache danych Next.js zwraca
 * zapisaną odpowiedź z oryginalnym nagłówkiem `Date`, więc stąd wiadomo, jak jest stara.
 */
export type FreshCacheStatus = "hit" | "miss" | "stale";

/**
 * Odpowiedź, której `Date` jest najwyżej tyle przed startem zapytania, przyszła właśnie
 * ze źródła, a nie z cache. Tolerancja pokrywa zaokrąglenie `Date` do pełnej sekundy
 * i różnicę zegarów serwerów.
 */
export const FRESH_FETCH_WINDOW_MS = 2500;

export function classifyCacheAge(ageMs: number, revalidateS: number): FreshCacheStatus {
  if (ageMs < FRESH_FETCH_WINDOW_MS) return "miss";
  if (ageMs < revalidateS * 1000) return "hit";
  return "stale";
}

/** Nagłówek `Date` odpowiedzi (albo `fallback`, gdy go brak). */
export function responseDate(response: Response, fallback: Date): Date {
  const header = response.headers.get("date");
  const parsed = header ? Date.parse(header) : Number.NaN;
  return Number.isNaN(parsed) ? fallback : new Date(parsed);
}
