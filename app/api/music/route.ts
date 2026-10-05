import { NextResponse, type NextRequest } from "next/server";
import { getMusicQueue, MUSIC_REVALIDATE_S } from "@/lib/music/audius";
import { musicMoodSchema } from "@/lib/music/mood";

/**
 * GET /api/music?mood=rain — kolejka ok. 10 utworów z Audius dla nastroju.
 * Zawsze 200: `available: false`, gdy Audius nie odpowiada. Strumień audio odtwarza klient
 * wprost z hosta Audius (tu tylko metadane).
 */
export async function GET(request: NextRequest) {
  const parsed = musicMoodSchema.safeParse(request.nextUrl.searchParams.get("mood"));
  if (!parsed.success) return NextResponse.json({ error: "nieznany nastrój" }, { status: 400 });
  const queue = await getMusicQueue(parsed.data);
  return NextResponse.json(queue, {
    headers: {
      "cache-control": queue.available ? `public, s-maxage=${MUSIC_REVALIDATE_S}, stale-while-revalidate=${MUSIC_REVALIDATE_S}` : "no-store",
    },
  });
}
