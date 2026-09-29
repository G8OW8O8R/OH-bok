import { NextResponse, type NextRequest } from "next/server";
import { coordsQuerySchema } from "@/lib/weather/coords";
import { getWeather } from "@/lib/weather/service";

/**
 * GET /api/weather?lat=&lon= — proxy Open-Meteo (backend-for-frontend).
 * Bez parametrów: Gdańsk. Błędne parametry: 400. Poza tym zawsze 200 z danymi
 * (live, cache albo demo) i nagłówkami diagnostycznymi dla Monitora.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let coords = null;

  if (params.has("lat") || params.has("lon")) {
    const parsed = coordsQuerySchema.safeParse({
      lat: params.get("lat") ?? "",
      lon: params.get("lon") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Nieprawidłowe współrzędne: podaj lat z zakresu -90…90 i lon z zakresu -180…180." },
        { status: 400 },
      );
    }
    coords = parsed.data;
  }

  const { data, cache, provider } = await getWeather(coords);
  const fresh = cache === "hit" || cache === "miss";

  return NextResponse.json(data, {
    headers: {
      "x-obok-cache": cache,
      "x-obok-provider": provider,
      // Dane awaryjne nie mogą utknąć w CDN na 30 minut.
      "cache-control": fresh ? "public, s-maxage=1800, stale-while-revalidate=600" : "no-store",
    },
  });
}
