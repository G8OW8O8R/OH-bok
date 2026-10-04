import { NextResponse, type NextRequest } from "next/server";
import { HISTORY_RANGE_CONFIG } from "@/lib/markets/history";
import { historyRangeSchema } from "@/lib/markets/schema";
import { getHistory } from "@/lib/markets/service";
import { parseSymbol } from "@/lib/markets/symbols";

/**
 * GET /api/markets/history?symbol=BTC&range=1D|1T|1M — historia do wykresu i sparkline:
 * świece Binance, zapasowo CoinGecko; cache dopasowany do zakresu. Błędne parametry: 400.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = parseSymbol(params.get("symbol"));
  const range = historyRangeSchema.safeParse(params.get("range") ?? "1D");
  if (!symbol || !range.success) {
    return NextResponse.json(
      { error: "Nieprawidłowe parametry: symbol = BTC|ETH|SOL|XRP|ADA, range = 1D|1T|1M." },
      { status: 400 },
    );
  }

  const { data, cache, provider } = await getHistory(symbol, range.data);
  const fresh = cache === "hit" || cache === "miss";
  const maxAge = HISTORY_RANGE_CONFIG[range.data].revalidateS;
  return NextResponse.json(data, {
    headers: {
      "x-obok-cache": cache,
      "x-obok-provider": provider,
      "cache-control": fresh ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` : "no-store",
    },
  });
}
