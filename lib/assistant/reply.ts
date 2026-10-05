import { MAX_REPLY_CHARS } from "./schema";

/**
 * Strażnik odpowiedzi tekstowej: zasady rozmowy z promptu wymuszone także w kodzie.
 * Maks. 3 zdania i 500 znaków, bez kodu i Markdownu, bez „komend” wplecionych w tekst.
 * Działa przyrostowo na strumieniu: wydany tekst jest zawsze początkiem tekstu końcowego.
 */

export const MAX_REPLY_SENTENCES = 3;

/** Zastępuje odpowiedź, która zaczyna się od kodu (prośba spoza zakresu asystenta pulpitu). */
export const OFF_TOPIC_REPLY =
  "Jestem asystentem pulpitu, więc nie piszę kodu ani długich tekstów. Mogę za to dodać coś do listy, ustawić przypomnienie albo sprawdzić pogodę.";
const CODE_AFTER_TEXT = "Kodu jednak nie piszę – jestem asystentem pulpitu.";

/**
 * Początek kodu albo wplecionych komend: tekst kończy się przed nim. Linia kodu (kończy się `{` albo `;`)
 * liczy się dopiero z końcem linii – średnik w zdaniu w trakcie strumienia niczego nie ucina.
 */
const CUT = /```|^[ \t]*<\/?[a-z][\w-]*[\s>/]|^.*[{;][ \t]*\n|\bKOMENDY\s*:/im;
/** Kod rozpoznany (a nie wpleciona „komenda”): inny tekst zastępczy. */
const CODE = /```|^[ \t]*<\/?[a-z]|[{;][ \t]*\n/m;
/** Do pierwszego końca zdania albo linii nic nie wychodzi: odpowiedź może się okazać kodem. */
const FIRST_LINE_HOLD = 80;
/** Skróty z kropką, które nie kończą zdania. */
const ABBREVIATION = /(?:^|[\s(])(?:np|ok|godz|tj|tzw|itp|itd|m\.in|ul|św|min|maks|zł|r|tys|mln|pkt|nr|ds|im|prof|dr)\.$/i;

/** Markdown na zwykły tekst (pogrubienia, nagłówki, punkty listy, kod w linii). */
function plain(text: string): string {
  return text
    .replace(/\*\*|__/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*•][ \t]+/gm, "")
    // Kod w linii, ale nie ``` (blok kodu rozpoznaje `CUT`).
    .replace(/(?<!`)`([^`\n]+)`(?!`)/g, "$1")
    .replace(/\r/g, "");
}

/** Indeks końca n-tego zdania (po znaku kończącym, przed białym znakiem), albo null. */
function sentenceEnd(text: string, count: number, final: boolean): number | null {
  let found = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (!/[.!?…]/.test(char)) continue;
    // Ciąg znaków kończących („?!”, „...”) liczy się raz.
    let end = i + 1;
    while (end < text.length && /[.!?…"”»)]/.test(text.charAt(end))) end += 1;
    const next = text.charAt(end);
    const atEnd = end >= text.length;
    if (!(atEnd ? final : /\s/.test(next))) {
      i = end - 1;
      continue;
    }
    if (char === "." && ABBREVIATION.test(text.slice(Math.max(0, i - 6), i + 1))) {
      i = end - 1;
      continue;
    }
    found += 1;
    if (found === count) return end;
    i = end - 1;
  }
  return null;
}

export interface ReplyState {
  /** Tekst bezpieczny do pokazania (przy `final` – kompletny). */
  text: string;
  /** Dalszy strumień niczego już nie zmieni (limit zdań/znaków, kod) – można przerwać model. */
  stopped: boolean;
}

/** Czysta funkcja: surowy tekst modelu → tekst do pokazania. */
export function sanitizeReply(raw: string, final: boolean): ReplyState {
  let text = plain(raw).replace(/^\s+/, "");
  let stopped = false;

  // Na końcu odpowiedzi ostatnia linia też jest kompletna.
  const cut = CUT.exec(final ? `${text}\n` : text);
  if (cut) {
    const before = text.slice(0, cut.index).trimEnd();
    const code = CODE.test(`${text.slice(cut.index)}\n`);
    if (before === "") return { text: code ? OFF_TOPIC_REPLY : "", stopped: true };
    // Bez poprawiania końcówki `before`: część mogła już pójść strumieniem.
    text = code ? `${before} ${CODE_AFTER_TEXT}` : before;
    stopped = true;
    final = true;
  }

  const end = sentenceEnd(text, MAX_REPLY_SENTENCES, final);
  if (end !== null && end < text.trimEnd().length) {
    text = text.slice(0, end);
    stopped = true;
  }

  if (text.length > MAX_REPLY_CHARS) {
    const space = text.lastIndexOf(" ", MAX_REPLY_CHARS - 1);
    text = `${text.slice(0, space > 0 ? space : MAX_REPLY_CHARS - 1).replace(/[\s,;:–-]+$/, "")}…`;
    stopped = true;
  }

  text = text.replace(/[ \t]*\n[ \t]*/g, " ").replace(/ {2,}/g, " ");
  return { text: final || stopped ? text.trimEnd() : text, stopped };
}

/**
 * Przyrostowy strażnik dla strumienia: wydaje tylko pełne słowa (końcówka może się jeszcze zmienić),
 * tekst końcowy przy `finish()`.
 */
export function createReplyGuard() {
  let raw = "";
  let emitted = "";
  let stopped = false;

  const drain = (final: boolean): string => {
    const state = sanitizeReply(raw, final);
    stopped = state.stopped;
    const done = final || state.stopped;
    const firstLine = !/[.!?…]\s|\n/.test(raw) && raw.length < FIRST_LINE_HOLD;
    if (!done && emitted === "" && firstLine) return "";
    const safe = done ? state.text : state.text.slice(0, Math.max(0, state.text.search(/\s\S*$/)));
    // Tekst zastępczy (kod na początku) może nie być przedłużeniem tego, co już poszło – wtedy nic.
    if (!safe.startsWith(emitted) || safe.length <= emitted.length) return "";
    const delta = safe.slice(emitted.length);
    emitted = safe;
    return delta;
  };

  return {
    push(delta: string): string {
      if (stopped) return "";
      raw += delta;
      return drain(false);
    },
    finish(): string {
      return stopped ? "" : drain(true);
    },
    get stopped() {
      return stopped;
    },
    get text() {
      return emitted;
    },
  };
}

/** Linki, które wolno kliknąć w odpowiedzi (kontakt do twórcy). Inne adresy zostają tekstem. */
const ALLOWED_LINKS: { pattern: RegExp; href: string }[] = [
  { pattern: /^(?:https?:\/\/)?govodigital\.vercel\.app\/?$/i, href: "https://govodigital.vercel.app" },
  { pattern: /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/piotrgoworek\/?$/i, href: "https://www.linkedin.com/in/piotrgoworek" },
];

const URL_LIKE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

export type ReplyPart = { text: string; href?: string };

/** Tekst odpowiedzi na fragmenty; adresy z białej listy dostają `href`. */
export function splitLinks(text: string): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_LIKE)) {
    const url = match[0].replace(/[.,;:!?)»”]+$/, "");
    const index = match.index;
    const allowed = ALLOWED_LINKS.find(({ pattern }) => pattern.test(url));
    if (!allowed) continue;
    if (index > last) parts.push({ text: text.slice(last, index) });
    parts.push({ text: url, href: allowed.href });
    last = index + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
