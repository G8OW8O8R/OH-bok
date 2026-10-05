import { formatTime } from "@/lib/time";
import type { NewsDigest } from "./schema";

/** Wiadomości dla asystenta (blok `<dane>`): streszczenie i po 5 nagłówków na kategorię. */
export interface NewsBrief {
  demo: boolean;
  summary: { polska: string; swiat: string } | null;
  headlines: Record<"polska" | "swiat", Array<{ tytuł: string; źródło: string; godzina: string }>>;
}

export function toNewsBrief(digest: NewsDigest, timeZone: string): NewsBrief {
  const list = (category: "polska" | "swiat") =>
    digest.categories[category].slice(0, 5).map((headline) => ({
      tytuł: headline.title,
      źródło: headline.source,
      godzina: formatTime(new Date(headline.publishedAt), timeZone),
    }));
  return {
    demo: digest.demo,
    summary: digest.summary ? { polska: digest.summary.polska, swiat: digest.summary.swiat } : null,
    headlines: { polska: list("polska"), swiat: list("swiat") },
  };
}
