import { z } from "zod";
import { providerIdSchema } from "@/lib/assistant/provider-ids";
import { newsCategorySchema } from "./sources";

/**
 * Jeden format wiadomości niezależnie od kanału: nagłówek, źródło, czas, link.
 * Bez opisów i treści artykułów (prawa autorskie – pokazujemy tylko to, co prowadzi do źródła).
 */

export const MAX_TITLE_LENGTH = 220;
/** Nagłówków na kategorię w odpowiedzi (okno Wiadomości). */
export const HEADLINES_PER_CATEGORY = 10;
export const MAX_SUMMARY_LENGTH = 280;

const httpUrl = z.url({ protocol: /^https?$/ });

export const headlineSchema = z.object({
  /** Stały identyfikator (z kanonicznego adresu) – klucz listy. */
  id: z.string().min(1).max(64),
  title: z.string().trim().min(3).max(MAX_TITLE_LENGTH),
  url: httpUrl,
  sourceId: z.string().min(1).max(40),
  source: z.string().min(1).max(40),
  publishedAt: z.iso.datetime({ offset: true }),
  /** Inne źródła z tą samą wiadomością (deduplikacja) – pisze o tym więcej redakcji. */
  alsoIn: z.array(z.string().max(40)).max(5).default([]),
});
export type Headline = z.infer<typeof headlineSchema>;

export const newsSummarySchema = z.object({
  polska: z.string().trim().min(10).max(MAX_SUMMARY_LENGTH),
  swiat: z.string().trim().min(10).max(MAX_SUMMARY_LENGTH),
  provider: providerIdSchema,
  generatedAt: z.iso.datetime({ offset: true }),
});
export type NewsSummary = z.infer<typeof newsSummarySchema>;

export const feedStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: newsCategorySchema,
  /** live = z kanału (także z cache danych), stale = ostatnie dane z pamięci instancji, down = brak. */
  state: z.enum(["live", "stale", "down"]),
});
export type FeedStatus = z.infer<typeof feedStatusSchema>;

const headlineList = z.array(headlineSchema).max(HEADLINES_PER_CATEGORY);

/** Odpowiedź `/api/news`. */
export const newsDigestSchema = z.object({
  fetchedAt: z.iso.datetime({ offset: true }),
  demo: z.boolean(),
  categories: z.object({ polska: headlineList, swiat: headlineList }),
  summary: newsSummarySchema.nullable(),
  /** Streszczenie jeszcze się generuje (klient zapyta raz ponownie). */
  summaryPending: z.boolean().default(false),
  feeds: z.array(feedStatusSchema),
});
export type NewsDigest = z.infer<typeof newsDigestSchema>;
