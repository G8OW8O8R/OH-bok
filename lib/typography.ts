const NBSP = " ";

/**
 * Polska typografia: słowa do 3 liter („do”, „bez”, „od”, „w”) łączymy twardą spacją z następnym,
 * żeby nie zostawały na końcu linii („Wieczór bez / deszczu”). `text-wrap: balance` jest tylko
 * heurystyką, to daje gwarancję.
 */
export function glueShortWords(text: string): string {
  return text.replace(/(^|\s)(\p{L}{1,3}) (?=\S)/gu, `$1$2${NBSP}`);
}
