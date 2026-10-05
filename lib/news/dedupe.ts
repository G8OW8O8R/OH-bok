import { titleStems } from "./normalize";
import type { Headline } from "./schema";

/**
 * Deduplikacja i wybór „najważniejszych”. Kanały nie mówią, co jest ważne,
 * więc ważność = ile redakcji o tym pisze (skupienie podobnych nagłówków) + świeżość.
 */

/** Wiadomości starsze niż tyle nie trafiają do „Dziś”. */
export const MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Każde kolejne źródło z tą samą wiadomością „odmładza” ją o tyle w rankingu. */
export const SOURCE_BONUS_MS = 6 * 60 * 60 * 1000;
/** W pierwszych 3 nagłówkach najwyżej 2 z jednego źródła. */
export const TOP_COUNT = 3;
const TOP_PER_SOURCE = 2;

/**
 * Dwa nagłówki o tym samym: współczynnik Jaccarda rdzeni ≥ 0,5 albo co najmniej 4 wspólne rdzenie
 * pokrywające ≥ 75% krótszego nagłówka (ta sama wiadomość z dopiskiem w jednym z tytułów).
 */
export function sameStory(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const stem of a) if (b.has(stem)) shared += 1;
  const union = a.size + b.size - shared;
  if (shared >= 3 && shared / union >= 0.5) return true;
  return shared >= 4 && shared / Math.min(a.size, b.size) >= 0.75;
}

interface Cluster {
  lead: Headline;
  stems: Set<string>;
  sources: Set<string>;
  names: string[];
  latest: number;
}

/**
 * Skupia ten sam adres i podobne nagłówki. Prowadzi najwcześniejsza pozycja (pierwsza redakcja,
 * która podała wiadomość); pozostałe źródła trafiają do `alsoIn`.
 */
export function dedupeHeadlines(headlines: readonly Headline[]): Array<Headline & { latestAt: string }> {
  const ordered = [...headlines].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const clusters: Cluster[] = [];
  const byUrl = new Map<string, Cluster>();
  for (const headline of ordered) {
    const stems = titleStems(headline.title);
    const cluster = byUrl.get(headline.url) ?? clusters.find((candidate) => sameStory(candidate.stems, stems));
    const at = Date.parse(headline.publishedAt);
    if (cluster) {
      if (!cluster.sources.has(headline.source)) {
        cluster.sources.add(headline.source);
        cluster.names.push(headline.source);
      }
      cluster.latest = Math.max(cluster.latest, at);
      byUrl.set(headline.url, cluster);
      continue;
    }
    const created: Cluster = { lead: headline, stems, sources: new Set([headline.source]), names: [], latest: at };
    clusters.push(created);
    byUrl.set(headline.url, created);
  }
  return clusters.map(({ lead, names, latest }) => ({
    ...lead,
    alsoIn: names.slice(0, 5),
    latestAt: new Date(latest).toISOString(),
  }));
}

/** Nagłówek bez pól pomocniczych rankingu. */
function withoutRanking(story: Headline & { latestAt: string }): Headline {
  const { id, title, url, sourceId, source, publishedAt, alsoIn } = story;
  return { id, title, url, sourceId, source, publishedAt, alsoIn };
}

/** Wynik w rankingu: najnowsza wzmianka + premia za każde dodatkowe źródło. */
export function storyScore(story: Headline & { latestAt: string }): number {
  return Date.parse(story.latestAt) + story.alsoIn.length * SOURCE_BONUS_MS;
}

/**
 * Nagłówki kategorii: deduplikacja, tylko ostatnie 48 h, ranking; pierwsze 3 z co najmniej
 * dwóch źródeł, gdy się da (jedna redakcja nie zajmuje całego widgetu).
 */
export function rankHeadlines(headlines: readonly Headline[], now: Date, limit: number): Headline[] {
  const fresh = headlines.filter((headline) => now.getTime() - Date.parse(headline.publishedAt) <= MAX_AGE_MS);
  const ranked = dedupeHeadlines(fresh).sort((a, b) => storyScore(b) - storyScore(a));

  const top: typeof ranked = [];
  const rest: typeof ranked = [];
  const perSource = new Map<string, number>();
  for (const story of ranked) {
    const count = perSource.get(story.sourceId) ?? 0;
    if (top.length < TOP_COUNT && count < TOP_PER_SOURCE) {
      top.push(story);
      perSource.set(story.sourceId, count + 1);
    } else {
      rest.push(story);
    }
  }
  // Za mało źródeł na różnorodność: dopełnienie pierwszej trójki w kolejności rankingu.
  while (top.length < TOP_COUNT && rest.length > 0) {
    const next = rest.shift();
    if (next) top.push(next);
  }
  return [...top, ...rest].slice(0, limit).map((story) => withoutRanking(story));
}
