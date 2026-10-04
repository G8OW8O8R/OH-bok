import { zonedDate } from "@/lib/time";
import { nbpRateSchema, type FxRate } from "./schema";

/**
 * Kurs USD/PLN: średni kurs NBP z tabeli A. Tabela ukazuje się w dni robocze około 12:00
 * czasu warszawskiego, więc kurs jest aktualny do publikacji w następnym dniu roboczym.
 */
export const NBP_USD_URL = "https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json";
const NBP_TIME_ZONE = "Europe/Warsaw";
/** Bezpieczny zapas po zwykłej porze publikacji tabeli A. */
const NBP_PUBLISHED_AT = "12:30";
/** Starszy kurs nie nadaje się już nawet jako „ostatni znany”: wtedy tylko USD. */
export const FX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Po terminie (święto, spóźniona tabela) pytamy NBP ponownie najwcześniej po tylu sekundach. */
export const FX_RETRY_S = 15 * 60;
/** Najkrótszy czas cache przed terminem. */
const FX_MIN_CACHE_S = 5 * 60;

function addDays(date: string, days: number): string {
  const [y = NaN, m = NaN, d = NaN] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Następny dzień roboczy (pon.–pt.) po `date`. Święta nie są znane: wtedy pomoże ponowne pytanie. */
export function nextBusinessDay(date: string): string {
  let next = addDays(date, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
  return next;
}

/** Do kiedy kurs z tabeli `effectiveDate` jest aktualny: następny dzień roboczy, 12:30 w Warszawie. */
export function nbpValidUntil(effectiveDate: string): Date {
  return zonedDate(nextBusinessDay(effectiveDate), NBP_PUBLISHED_AT, NBP_TIME_ZONE);
}

/** Odpowiedź NBP → kurs albo null. */
export function normalizeNbp(raw: unknown, fetchedAt: Date): FxRate | null {
  const parsed = nbpRateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const latest = parsed.data.rates.at(-1);
  if (!latest) return null;
  return {
    base: "USD",
    quote: "PLN",
    rate: latest.mid,
    effectiveDate: latest.effectiveDate,
    validUntil: nbpValidUntil(latest.effectiveDate).toISOString(),
    fetchedAt: fetchedAt.toISOString(),
  };
}

/** Kurs aktualny: przed publikacją kolejnej tabeli. */
export function isFxFresh(fx: FxRate, now: Date): boolean {
  return now.getTime() < Date.parse(fx.validUntil);
}

/** Kurs, którego wolno użyć (także nieaktualny, ale nie starszy niż 14 dni), albo null. */
export function usableFx(fx: FxRate | null, now: Date): FxRate | null {
  if (!fx) return null;
  return now.getTime() - Date.parse(`${fx.effectiveDate}T00:00:00Z`) <= FX_MAX_AGE_MS ? fx : null;
}

/** Ile sekund wolno trzymać kurs w cache: do terminu (min. 5 min), po terminie 15 min. */
export function fxCacheSeconds(fx: FxRate, now: Date): number {
  const left = Math.floor((Date.parse(fx.validUntil) - now.getTime()) / 1000);
  return left > 0 ? Math.max(left, FX_MIN_CACHE_S) : FX_RETRY_S;
}
