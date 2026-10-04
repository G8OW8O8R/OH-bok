import { NextResponse } from "next/server";
import { getQuotes, MARKETS_REVALIDATE_S } from "@/lib/markets/service";

/**
 * GET /api/markets — zapasowe źródło cen: CoinGecko przez serwer (klucz nie trafia do
 * przeglądarki), cache 30 s. Zawsze 200 z danymi (live, cache albo demo) i nagłówkami
 * diagnostycznymi dla Monitora.
 */
export async function GET() {
  const { data, cache, provider } = await getQuotes();
  const fresh = cache === "hit" || cache === "miss";
  return NextResponse.json(data, {
    headers: {
      "x-obok-cache": cache,
      "x-obok-provider": provider,
      "cache-control": fresh ? `public, s-maxage=${MARKETS_REVALIDATE_S}, stale-while-revalidate=${MARKETS_REVALIDATE_S}` : "no-store",
    },
  });
}
