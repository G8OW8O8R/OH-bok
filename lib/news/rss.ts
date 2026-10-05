/**
 * Mały parser kanałów RSS 2.0, RSS 1.0 (RDF) i Atom – bez zależności. Z każdej pozycji
 * czyta tylko tytuł, link i datę: treści artykułów nie potrzebujemy i jej nie przetwarzamy.
 * Wynik to surowe pola; walidacja i normalizacja w `normalize.ts`.
 */

export interface RawFeedItem {
  title: string;
  link: string | null;
  published: string | null;
}

/** Ochrona przed ogromnym kanałem: dalej nie czytamy. */
export const MAX_FEED_ITEMS = 80;

/**
 * Bajty kanału → tekst. Kodowanie z nagłówka `Content-Type`, potem z deklaracji XML
 * (np. `ISO-8859-2` w starszych polskich kanałach), domyślnie UTF-8.
 */
export function decodeFeed(bytes: ArrayBuffer | Uint8Array, contentType: string | null): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const head = new TextDecoder("latin1").decode(view.subarray(0, 200));
  const fromXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  for (const label of [fromHeader, fromXml, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(view).replace(/^﻿/, "");
    } catch {
      // Nieznane kodowanie: następny kandydat.
    }
  }
  return "";
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  rdquo: "”",
  ldquo: "“",
  lsquo: "‘",
  rsquo: "’",
  oacute: "ó",
  Oacute: "Ó",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const value = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

/**
 * Zawartość elementu jako zwykły tekst: CDATA rozpakowane, znaczniki HTML usunięte, encje
 * zdekodowane (także w CDATA – wydawcy wstawiają tam `&quot;` jak w HTML-u), białe znaki zwinięte.
 */
export function plainText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Encje dwa razy: `&amp;quot;` (podwójnie zakodowane) też trafia się w kanałach.
  return decodeEntities(decodeEntities(unwrapped.replace(/<[^>]*>/g, " ")))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function element(block: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match ? (match[1] ?? "") : null;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decodeEntities(match[1] ?? match[2] ?? "") : null;
}

/** Link pozycji: `<link>` (RSS), `<link href>` (Atom, rel="alternate" albo bez rel), stały `guid`, `rdf:about`. */
function itemLink(block: string, openTag: string): string | null {
  const text = element(block, "link");
  if (text !== null && plainText(text) !== "") return plainText(text);
  for (const tag of block.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, "rel");
    const href = attribute(tag, "href");
    if (href && (rel === null || rel === "alternate")) return href.trim();
  }
  const guidMatch = /<guid(\s[^>]*)?>([\s\S]*?)<\/guid>/i.exec(block);
  if (guidMatch && attribute(guidMatch[1] ?? "", "isPermaLink") !== "false") {
    const guid = plainText(guidMatch[2] ?? "");
    if (/^https?:\/\//i.test(guid)) return guid;
  }
  return attribute(openTag, "rdf:about");
}

const DATE_ELEMENTS = ["pubDate", "dc:date", "published", "updated"] as const;

export function parseFeed(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  // `\b` po nazwie: `<items>` (spis w RSS 1.0) to nie pozycja.
  for (const match of xml.matchAll(/(<(item|entry)\b[^>]*>)([\s\S]*?)<\/\2>/gi)) {
    if (items.length >= MAX_FEED_ITEMS) break;
    const openTag = match[1] ?? "";
    const block = match[3] ?? "";
    const title = plainText(element(block, "title") ?? "");
    if (!title) continue;
    const date = DATE_ELEMENTS.map((name) => element(block, name)).find((value) => value !== null);
    items.push({ title, link: itemLink(block, openTag), published: date ? plainText(date) : null });
  }
  return items;
}

/** Skróty stref spotykane w RFC 822 (V8 nie zna CET/CEST). */
const ZONE_ABBREVIATIONS: Record<string, string> = { CET: "+0100", CEST: "+0200", BST: "+0100", UT: "+0000" };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Data i godzina „na zegarze” z RFC 822 albo ISO 8601, bez strefy: `["2026-10-05", "17:00"]`.
 * Dla kanałów, które podają czas lokalny z błędnym przesunięciem.
 */
export function feedWallClock(value: string): [date: string, time: string] | null {
  const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
  if (iso) return [iso[1] ?? "", iso[2] ?? ""];
  const rfc = /(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})/i.exec(value);
  if (!rfc) return null;
  const month = MONTHS.indexOf((rfc[2] ?? "").toLowerCase()) + 1;
  if (month === 0) return null;
  const pad = (part: string | number) => String(part).padStart(2, "0");
  return [`${rfc[3]}-${pad(month)}-${pad(rfc[1] ?? "")}`, `${pad(rfc[4] ?? "")}:${rfc[5]}`];
}

/** Data z kanału (RFC 822 albo ISO 8601) → chwila; null, gdy nie da się jej odczytać. */
export function parseFeedDate(value: string | null): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\b(CEST|CET|BST|UT)$/, (zone) => ZONE_ABBREVIATIONS[zone] ?? zone);
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : new Date(ms);
}
