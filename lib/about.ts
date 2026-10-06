/**
 * Treść okna „O systemie”: autor, technologie, źródła danych z atrybucjami, zapis w przeglądarce
 * i wersja. Czyste dane – okno i README korzystają z tych samych faktów.
 */

export const ABOUT_SUMMARY =
  "Obok to webowy „system operacyjny” dnia: pogoda, lista, przypomnienia, rynki i wiadomości na żywo w scenie latarni morskiej, która zmienia się razem z prawdziwą pogodą.";

export const AUTHOR = {
  name: "Piotr Goworek",
  studio: "GOVO DIGITAL",
  links: [
    { label: "govodigital.vercel.app", href: "https://govodigital.vercel.app" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/piotrgoworek" },
  ],
} as const;

export const TECHNOLOGIES = [
  "Next.js 16",
  "React 19",
  "TypeScript strict",
  "Tailwind CSS 4",
  "Motion",
  "Zustand",
  "Zod",
  "WebGL2 · własny shader",
  "Lucide",
  "Vitest",
  "Playwright",
  "Vercel",
] as const;

export interface Source {
  name: string;
  href: string;
  /** Licencja albo wymagany dopisek. */
  note?: string;
}

export interface AttributionGroup {
  /** Co pochodzi z tych źródeł. */
  label: string;
  sources: readonly Source[];
  detail?: string;
}

export const ATTRIBUTIONS: readonly AttributionGroup[] = [
  { label: "Pogoda", sources: [{ name: "Open-Meteo.com", href: "https://open-meteo.com/", note: "CC BY 4.0" }] },
  {
    label: "Rynki",
    sources: [
      { name: "Binance", href: "https://www.binance.com/" },
      { name: "CoinGecko", href: "https://www.coingecko.com/", note: "Data provided by CoinGecko" },
      { name: "NBP", href: "https://nbp.pl/" },
    ],
  },
  {
    label: "Wiadomości",
    sources: [
      { name: "RMF24", href: "https://www.rmf24.pl/" },
      { name: "Bankier.pl", href: "https://www.bankier.pl/" },
      { name: "Euronews", href: "https://pl.euronews.com/" },
      { name: "DW", href: "https://www.dw.com/pl/" },
    ],
    detail: "tylko nagłówki",
  },
  { label: "Muzyka", sources: [{ name: "Audius", href: "https://audius.co/" }], detail: "artyści podpisani przy utworach" },
  {
    label: "Asystent",
    sources: [
      { name: "Groq", href: "https://groq.com/" },
      { name: "Google Gemini", href: "https://ai.google.dev/" },
      { name: "Cloudflare Workers AI", href: "https://developers.cloudflare.com/workers-ai/" },
    ],
  },
  {
    label: "Ikony i krój",
    sources: [
      { name: "Lucide", href: "https://lucide.dev/", note: "ISC" },
      { name: "Inter", href: "https://rsms.me/inter/", note: "SIL OFL" },
    ],
  },
];

/** Wzmianka przy atrybucjach assetów (bez osobnej sekcji). */
export const SCENES_CREDIT = { label: "Sceny i postacie", value: "Nano Banana Pro, Veo" } as const;

export interface StoredItem {
  key: string;
  where: "ciasteczko" | "localStorage";
  what: string;
}

/** Wszystko, co strona zapisuje w przeglądarce. */
export const STORED_DATA: readonly StoredItem[] = [
  { key: "obok-loc", where: "ciasteczko", what: "lokalizacja ~1 km po zgodzie" },
  { key: "obok-weather", where: "localStorage", what: "zgoda, lokalizacja, ostatnia pogoda" },
  { key: "obok-shopping", where: "localStorage", what: "lista zakupów" },
  { key: "obok-reminders", where: "localStorage", what: "przypomnienia" },
  { key: "obok-alerts", where: "localStorage", what: "alerty cenowe" },
  { key: "obok-markets", where: "localStorage", what: "waluta, ostatni kurs NBP" },
  { key: "obok-windows", where: "localStorage", what: "pozycje okien" },
  { key: "obok-boot", where: "localStorage", what: "start już widziany" },
];

export const PRIVACY_NOTE =
  "Dokładna pozycja nie opuszcza przeglądarki. Serwer dostaje tylko zaokrągloną lokalizację i pytania do asystenta (z pogodą, listą i przypomnieniami jako kontekstem) – bez zapisu.";

export interface BuildInfo {
  /** Skrót commita (7 znaków) albo null lokalnie. */
  commit: string | null;
  builtAt: Date | null;
  /** Link do commita w repozytorium, gdy znane. */
  href: string | null;
}

/** Wersja z build-time env (`next.config.ts`: zmienne systemowe Vercela); bez nich = „lokalnie”. */
export function buildInfo(env: { commit?: string; builtAt?: string; repo?: string }): BuildInfo {
  const commit = env.commit && /^[0-9a-f]{7,40}$/i.test(env.commit) ? env.commit.slice(0, 7) : null;
  const time = env.builtAt ? Date.parse(env.builtAt) : Number.NaN;
  const builtAt = commit && Number.isFinite(time) ? new Date(time) : null;
  const href = commit && env.repo ? `${env.repo}/commit/${env.commit}` : null;
  return { commit, builtAt, href };
}

/** Schemat architektury (okno „O systemie”, README): trasa API → źródło. Rynki pierwsze: do nich biegnie też WebSocket. */
export const ARCHITECTURE_ROUTES = [
  { route: "/api/markets", source: "Binance · CoinGecko" },
  { route: "/api/weather", source: "Open-Meteo" },
  { route: "/api/fx", source: "NBP" },
  { route: "/api/news", source: "RSS · 5 kanałów" },
  { route: "/api/music", source: "Audius" },
  { route: "/api/assistant", source: "Groq · Gemini · Cloudflare" },
] as const;

export const ARCHITECTURE_DESCRIPTION =
  "Przeglądarka pyta trasy API Next.js; każda ma cache danych, a przy awarii źródła oddaje ostatnie dane z pamięci albo dane demo. " +
  ARCHITECTURE_ROUTES.map(({ route, source }) => `${route} → ${source}`).join(", ") +
  ". Ceny na żywo płyną z Binance prosto do przeglądarki przez WebSocket.";
