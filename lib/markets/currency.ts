import { z } from "zod";

/** Waluta wyświetlania. Ceny przychodzą w USD; PLN po średnim kursie NBP. */
export const CURRENCIES = ["USD", "PLN"] as const;
export const currencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof currencySchema>;

/** USD → waluta. PLN bez kursu = null (nie zgadujemy). */
export function fromUsd(usd: number, currency: Currency, usdPln: number | null): number | null {
  if (currency === "USD") return usd;
  return usdPln !== null && usdPln > 0 ? usd * usdPln : null;
}

/** Kwota w walucie → USD. PLN bez kursu = null. */
export function toUsd(amount: number, currency: Currency, usdPln: number | null): number | null {
  if (currency === "USD") return amount;
  return usdPln !== null && usdPln > 0 ? amount / usdPln : null;
}

/** Waluta, którą da się pokazać: PLN bez kursu → USD (łagodna degradacja). */
export function displayCurrency(requested: Currency, usdPln: number | null): Currency {
  return requested === "PLN" && (usdPln === null || usdPln <= 0) ? "USD" : requested;
}

/** Miejsca po przecinku: grosze dla cen ≥ 1, cztery miejsca dla tanich monet (ADA, XRP poniżej 1). */
export function priceFractionDigits(value: number): number {
  return Math.abs(value) >= 1 ? 2 : 4;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: Currency, digits: number): Intl.NumberFormat {
  const key = `${currency}:${digits}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, cached);
  }
  return cached;
}

/** `85 329,00 $`, `0,2479 $`, `331 776,63 zł` */
export function formatPrice(value: number, currency: Currency): string {
  return formatter(currency, priceFractionDigits(value)).format(value);
}

const percent = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** `+1,23%`, `−0,40%`, `0,00%` */
export function formatChange(pct: number): string {
  // Typograficzny minus zamiast łącznika z `Intl`.
  return `${percent.format(pct).replace("-", "−")}%`;
}
