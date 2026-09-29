/**
 * Polska odmiana liczebnika: 1 składnik, 2–4 składniki, 5–21 składników, 22 składniki…
 * `forms` = [jeden, kilka, wiele].
 */
export function pluralPl(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(Math.trunc(count));
  if (n === 1) return forms[0];
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}
