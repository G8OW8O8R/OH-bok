import { NextResponse } from "next/server";
import { fxCacheSeconds, isFxFresh } from "@/lib/markets/fx";
import { getFx } from "@/lib/markets/service";

/**
 * GET /api/fx — średni kurs USD/PLN z NBP. Aktualny kurs zostaje w CDN do publikacji
 * tabeli w następnym dniu roboczym. Bez NBP: ostatni znany kurs, a bez niego 503 –
 * klient pokazuje wtedy tylko USD.
 */
export async function GET() {
  const result = await getFx();
  if (!result) {
    return NextResponse.json(
      { error: "Kurs NBP jest chwilowo niedostępny." },
      { status: 503, headers: { "x-obok-cache": "demo", "x-obok-provider": "nbp", "cache-control": "no-store" } },
    );
  }

  const now = new Date();
  const { data, cache, provider } = result;
  // Kurs jest ten sam niezależnie od tego, skąd przyszedł (NBP, cache danych, pamięć instancji):
  // do publikacji następnej tabeli wolno go trzymać w CDN.
  const cacheable = isFxFresh(data, now);
  return NextResponse.json(data, {
    headers: {
      "x-obok-cache": cache,
      "x-obok-provider": provider,
      "cache-control": cacheable ? `public, s-maxage=${fxCacheSeconds(data, now)}` : "no-store",
    },
  });
}
