import { fold } from "@/lib/commands/text";
import { zonedDate } from "@/lib/time";
import { feedWallClock, parseFeedDate, type RawFeedItem } from "./rss";
import { headlineSchema, MAX_TITLE_LENGTH, type Headline } from "./schema";
import type { NewsSource } from "./sources";

/**
 * Pozycje kanału → nagłówki w jednym formacie. Każda pozycja walidowana osobno:
 * bez daty, z linkiem spoza domeny źródła albo nie-http(s) odpada, reszta zostaje.
 */

/** Parametry śledzące i znaczniki kanału – nie odróżniają artykułów. */
const TRACKING_PARAM = /^(utm_\w+|maca|at_\w+|fbclid|gclid|ref|src)$/i;

/**
 * Adres kanoniczny do porównań i identyfikatora: https, host bez `www.`, bez fragmentu,
 * bez parametrów śledzących i końcowego ukośnika. Null = niedozwolony adres.
 */
export function canonicalUrl(raw: string, domain: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== domain && !host.endsWith(`.${domain}`)) return null;
  url.protocol = "https:";
  url.hostname = host.replace(/^www\./, "");
  url.hash = "";
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

/** Link do artykułu dla czytelnika: oryginalny adres, tylko przeniesiony na https i bez parametrów śledzących. */
function articleUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.protocol = "https:";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  return url.toString();
}

/** Chwila publikacji; przy `wallClockZone` liczy się godzina na zegarze w tej strefie. */
export function publishedAt(value: string | null, source: NewsSource): Date | null {
  if (!source.wallClockZone || !value) return parseFeedDate(value);
  const wall = feedWallClock(value);
  const at = wall ? zonedDate(wall[0], wall[1], source.wallClockZone) : null;
  return at && !Number.isNaN(at.getTime()) ? at : parseFeedDate(value);
}

/** FNV-1a (32 bity) jako tekst – krótki, stały identyfikator z adresu. */
export function hashId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Za długi nagłówek ucięty na granicy słowa (wyświetlamy i tak maks. 2 linie). */
export function clampTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  const cut = title.lastIndexOf(" ", MAX_TITLE_LENGTH - 1);
  return `${title.slice(0, cut > 40 ? cut : MAX_TITLE_LENGTH - 1).replace(/[\s,;:–-]+$/, "")}…`;
}

export function normalizeFeed(items: readonly RawFeedItem[], source: NewsSource, fetchedAt: Date): Headline[] {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.link) continue;
    const canonical = canonicalUrl(item.link, source.domain);
    const published = publishedAt(item.published, source);
    if (!canonical || !published || seen.has(canonical)) continue;
    // Data z przyszłości (zła strefa w kanale) nie może wyprzedzić chwili pobrania.
    const at = published.getTime() > fetchedAt.getTime() ? fetchedAt : published;
    const parsed = headlineSchema.safeParse({
      id: hashId(canonical),
      title: clampTitle(item.title),
      url: articleUrl(item.link),
      sourceId: source.id,
      source: source.name,
      publishedAt: at.toISOString(),
      alsoIn: [],
    });
    if (!parsed.success) continue;
    seen.add(canonical);
    headlines.push(parsed.data);
  }
  return headlines;
}

/** Słowa bez znaczenia dla porównania nagłówków. */
const STOPWORDS = new Set(
  "a aby ale albo bez by byc byl byla bylo czy dla do gdy go i ich im jak jako jest juz ktora ktore ktory lub ma maja mu na nad nie niz o od oraz po pod przed przez sa sie so tak takze tam to tu tylko w we wiec z za ze zas co".split(" "),
);

/**
 * Rdzenie słów nagłówka do porównań: bez polskich znaków i interpunkcji, bez słów krótszych
 * niż 3 litery i słów pustych; z każdego słowa 5 pierwszych liter (proste ujednolicenie odmiany:
 * „Ukrainy” i „Ukraina” to ten sam rdzeń).
 */
export function titleStems(title: string): Set<string> {
  const words = fold(title)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return new Set(words.map((word) => word.slice(0, 5)));
}
