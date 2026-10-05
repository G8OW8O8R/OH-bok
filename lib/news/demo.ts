import { hashId } from "./normalize";
import type { Headline, NewsDigest } from "./schema";
import { NEWS_SOURCES, type NewsCategory } from "./sources";

/**
 * Dane demo: gdy żaden kanał nie odpowiada i nie ma nic w pamięci. Zawsze z oznaczeniem
 * „demo”; nagłówki są przykładowe, a linki prowadzą na strony główne źródeł (nie do artykułów).
 */
const DEMO_TITLES: Record<NewsCategory, Array<[sourceId: string, title: string, minutesAgo: number]>> = {
  polska: [
    ["rmf24-polska", "Przykładowy nagłówek: rząd przedstawił plan budowy nowych mieszkań", 40],
    ["bankier", "Przykładowy nagłówek: inflacja w Polsce zgodna z prognozami ekonomistów", 95],
    ["rmf24-polska", "Przykładowy nagłówek: nowa linia metra w Krakowie coraz bliżej", 180],
  ],
  swiat: [
    ["euronews", "Przykładowy nagłówek: szczyt UE o wspólnej polityce energetycznej", 35],
    ["dw", "Przykładowy nagłówek: Niemcy przyjęły budżet na przyszły rok", 120],
    ["rmf24-swiat", "Przykładowy nagłówek: fala upałów w południowej Europie", 210],
  ],
};

const HOMEPAGES: Record<string, string> = {
  "rmf24-polska": "https://www.rmf24.pl/fakty/polska",
  bankier: "https://www.bankier.pl/",
  "rmf24-swiat": "https://www.rmf24.pl/fakty/swiat",
  euronews: "https://pl.euronews.com/",
  dw: "https://www.dw.com/pl/",
};

function demoHeadlines(category: NewsCategory, now: Date): Headline[] {
  return DEMO_TITLES[category].map(([sourceId, title, minutesAgo]) => {
    const source = NEWS_SOURCES.find((candidate) => candidate.id === sourceId);
    return {
      id: hashId(`demo:${title}`),
      title,
      url: HOMEPAGES[sourceId] ?? "https://www.rmf24.pl/",
      sourceId,
      source: source?.name ?? sourceId,
      publishedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
      alsoIn: [],
    };
  });
}

export function demoDigest(now: Date): NewsDigest {
  return {
    fetchedAt: now.toISOString(),
    demo: true,
    categories: { polska: demoHeadlines("polska", now), swiat: demoHeadlines("swiat", now) },
    summary: null,
    summaryPending: false,
    feeds: NEWS_SOURCES.map(({ id, name, category }) => ({ id, name, category, state: "down" as const })),
  };
}
