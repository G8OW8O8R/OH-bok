import { after, NextResponse } from "next/server";
import { NEWS_REVALIDATE_S } from "@/lib/news/service";
import { getNewsDigest } from "@/lib/news/server";

/** Streszczenie: pierwszy fragment do 8 s na dostawcę, całość do 15 s (dokańczane po odpowiedzi). */
export const maxDuration = 45;

/** Tyle czekamy na streszczenie, zanim oddamy same nagłówki (`summaryPending`). */
const SUMMARY_WAIT_MS = 6000;

/**
 * GET /api/news — „Najważniejsze dziś”: nagłówki z kanałów RSS (Polska / świat),
 * zdeduplikowane, z cache danych 30 min, + wspólne streszczenie AI (raz na godzinę). Zawsze 200:
 * dane świeże, z cache, z pamięci instancji (`stale`) albo demo. Bez treści artykułów.
 */
export async function GET() {
  const { digest, cache, pending } = await getNewsDigest(SUMMARY_WAIT_MS);
  // Streszczenie dokańcza się po odpowiedzi i trafia do wspólnego cache (następne zapytanie je dostanie).
  if (pending) after(() => pending);
  const fresh = (cache === "hit" || cache === "miss") && !digest.summaryPending;
  return NextResponse.json(digest, {
    headers: {
      "x-obok-cache": cache,
      "x-obok-provider": digest.summary?.provider ?? (digest.demo ? "demo" : "rss"),
      "cache-control": fresh ? `public, s-maxage=${NEWS_REVALIDATE_S / 6}, stale-while-revalidate=${NEWS_REVALIDATE_S}` : "no-store",
    },
  });
}
