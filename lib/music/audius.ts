import { z } from "zod";
import { MAX_TRACK_S, MIN_TRACK_S, MOOD_PROFILES, QUEUE_LENGTH, type MusicMood } from "./mood";
import type { MusicQueue, Track } from "./schema";

/**
 * Audius po stronie serwera: darmowe API bez logowania. `api.audius.co` zwraca listę
 * hostów (discovery nodes); wybieramy pierwszy, który odpowiada na wyszukiwanie, i pamiętamy go
 * w instancji na godzinę. Wyniki wyszukiwania przez cache danych Next.js (1 h). Do klienta idą
 * tylko metadane i adres strumienia na hoście Audius – dźwięk nie przechodzi przez nasz serwer.
 */

export const MUSIC_REVALIDATE_S = 60 * 60;
export const AUDIUS_APP_NAME = "obok";
const DIRECTORY = "https://api.audius.co";
const TIMEOUT_MS = 4000;
/** Ilu hostów próbujemy w jednym zapytaniu, zanim uznamy Audius za niedostępny. */
const MAX_HOST_ATTEMPTS = 3;
/** Ten sam artysta najwyżej tyle razy w kolejce. */
const MAX_PER_ARTIST = 2;

const hostListSchema = z.object({ data: z.array(z.url()).min(1) });

const audiusTrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  duration: z.number(),
  permalink: z.string().startsWith("/"),
  is_streamable: z.boolean().optional(),
  user: z.object({ name: z.string().trim().min(1) }),
  artwork: z.record(z.string(), z.string().nullable()).nullable().optional(),
});

const searchSchema = z.object({ data: z.array(z.unknown()) });

type AudiusTrack = z.infer<typeof audiusTrackSchema>;

export interface MusicServiceDeps {
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
  onUpstreamError?: (where: string, error: unknown) => void;
}

export const defaultMusicDeps: MusicServiceDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  random: Math.random,
  onUpstreamError: (where, error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[music] ${where}: ${reason}`);
  },
};

let activeHost: { url: string; until: number } | null = null;

async function getJson(url: string, deps: MusicServiceDeps, cache: boolean): Promise<unknown> {
  const response = await deps.fetch(url, {
    headers: { accept: "application/json" },
    ...(cache ? { next: { revalidate: MUSIC_REVALIDATE_S, tags: ["music"] } } : { cache: "no-store" as const }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Kandydaci na hosta: zapamiętany, potem lista z katalogu (losowo), na końcu sam katalog. */
async function candidateHosts(deps: MusicServiceDeps): Promise<string[]> {
  const remembered = activeHost && activeHost.until > deps.now() ? [activeHost.url] : [];
  let listed: string[] = [];
  try {
    const parsed = hostListSchema.safeParse(await getJson(DIRECTORY, deps, true));
    if (parsed.success) listed = shuffled(parsed.data.data, deps.random);
  } catch (error) {
    deps.onUpstreamError?.("lista hostów", error);
  }
  const all = [...remembered, ...listed, DIRECTORY].map((url) => url.replace(/\/+$/, ""));
  return [...new Set(all)];
}

function searchUrl(host: string, query: string): string {
  const params = new URLSearchParams({ query, app_name: AUDIUS_APP_NAME, limit: "40" });
  return `${host}/v1/tracks/search?${params}`;
}

async function search(host: string, query: string, deps: MusicServiceDeps): Promise<AudiusTrack[]> {
  const parsed = searchSchema.parse(await getJson(searchUrl(host, query), deps, true));
  return parsed.data.flatMap((raw) => {
    const track = audiusTrackSchema.safeParse(raw);
    return track.success ? [track.data] : [];
  });
}

function toTrack(track: AudiusTrack, host: string): Track | null {
  const artwork = track.artwork?.["480x480"] ?? track.artwork?.["1000x1000"] ?? track.artwork?.["150x150"] ?? null;
  const params = new URLSearchParams({ app_name: AUDIUS_APP_NAME });
  const candidate = {
    id: track.id,
    title: track.title,
    artist: track.user.name,
    url: `https://audius.co${track.permalink}`,
    artwork: artwork && /^https:\/\//.test(artwork) ? artwork : null,
    duration: track.duration,
    stream: `${host}/v1/tracks/${encodeURIComponent(track.id)}/stream?${params}`,
  };
  return URL.canParse(candidate.url) && URL.canParse(candidate.stream) ? candidate : null;
}

/** Kolejka: 2–8 min, bez powtórek, najwyżej dwa utwory artysty, przemieszana. */
function pickQueue(results: readonly AudiusTrack[][], host: string, random: () => number): Track[] {
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  const pool: Track[] = [];
  for (const track of results.flat()) {
    if (track.is_streamable === false || track.duration < MIN_TRACK_S || track.duration > MAX_TRACK_S) continue;
    const artist = track.user.name.toLocaleLowerCase("pl");
    if (seen.has(track.id) || (perArtist.get(artist) ?? 0) >= MAX_PER_ARTIST) continue;
    const normalized = toTrack(track, host);
    if (!normalized) continue;
    seen.add(track.id);
    perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
    pool.push(normalized);
  }
  return shuffled(pool, random).slice(0, QUEUE_LENGTH);
}

/** Kolejka dla nastroju. Nigdy nie rzuca: przy awarii `available: false`. */
export async function getMusicQueue(mood: MusicMood, deps: MusicServiceDeps = defaultMusicDeps): Promise<MusicQueue> {
  const profile = MOOD_PROFILES[mood];
  const hosts = (await candidateHosts(deps)).slice(0, MAX_HOST_ATTEMPTS);
  for (const host of hosts) {
    try {
      const settled = await Promise.allSettled(profile.queries.map((query) => search(host, query, deps)));
      const results = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      if (results.length === 0) throw new Error("wyszukiwanie nie odpowiada");
      const tracks = pickQueue(results, host, deps.random);
      if (tracks.length === 0) throw new Error("brak utworów 2–8 min");
      activeHost = { url: host, until: deps.now() + MUSIC_REVALIDATE_S * 1000 };
      return { available: true, mood, label: profile.label, tracks };
    } catch (error) {
      deps.onUpstreamError?.(host, error);
      if (activeHost?.url === host) activeHost = null;
    }
  }
  return { available: false, mood, label: profile.label };
}
