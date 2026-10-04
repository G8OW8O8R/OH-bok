import { z } from "zod";
import { currencySchema, formatPrice, fromUsd, type Currency } from "./currency";
import { marketSymbolSchema, type Quote } from "./schema";
import type { MarketSymbol } from "./symbols";

/**
 * Alerty cenowe: warunek „powyżej / poniżej” progu w wybranej walucie, sprawdzany
 * przy każdej paczce cen, gdy strona jest otwarta. Spełniony alert odpala raz i zostaje
 * oznaczony jako wykonany.
 */
export const ALERT_CONDITIONS = ["above", "below"] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

export const MAX_ALERTS = 20;

export const priceAlertSchema = z.object({
  id: z.string().min(1),
  symbol: marketSymbolSchema,
  condition: z.enum(ALERT_CONDITIONS),
  threshold: z.number().positive(),
  currency: currencySchema,
  createdAt: z.iso.datetime({ offset: true }),
  triggeredAt: z.iso.datetime({ offset: true }).nullable(),
  /** Cena (w walucie alertu), przy której alert odpalił. */
  triggeredPrice: z.number().positive().nullable(),
});
export type PriceAlert = z.infer<typeof priceAlertSchema>;

export interface AlertInput {
  symbol: MarketSymbol;
  condition: AlertCondition;
  threshold: number;
  currency: Currency;
}

export function createAlert(input: AlertInput, id: string, now: Date): PriceAlert {
  return { ...input, id, createdAt: now.toISOString(), triggeredAt: null, triggeredPrice: null };
}

export function isPending(alert: PriceAlert): boolean {
  return alert.triggeredAt === null;
}

/**
 * Czy warunek jest spełniony przy cenie `priceUsd`. null = nie da się ocenić
 * (alert w PLN bez kursu): alert czeka, nie odpala na zgadywanym przeliczeniu.
 */
export function isAlertMet(alert: PriceAlert, priceUsd: number, usdPln: number | null): boolean | null {
  const price = fromUsd(priceUsd, alert.currency, usdPln);
  if (price === null) return null;
  return alert.condition === "above" ? price >= alert.threshold : price <= alert.threshold;
}

export interface AlertEvaluation {
  alerts: PriceAlert[];
  /** Alerty, które odpaliły w tej ocenie (już oznaczone). */
  triggered: PriceAlert[];
}

/**
 * Ocena oczekujących alertów względem bieżących cen. Ceny demo (brak prawdziwych danych)
 * nigdy nie odpalają alertu.
 */
export function evaluateAlerts(
  alerts: readonly PriceAlert[],
  quotes: Partial<Record<MarketSymbol, Quote>>,
  usdPln: number | null,
  now: Date,
): AlertEvaluation {
  const triggered: PriceAlert[] = [];
  const next = alerts.map((alert) => {
    if (!isPending(alert)) return alert;
    const quote = quotes[alert.symbol];
    if (!quote || quote.source === "demo") return alert;
    if (isAlertMet(alert, quote.priceUsd, usdPln) !== true) return alert;
    const fired: PriceAlert = {
      ...alert,
      triggeredAt: now.toISOString(),
      triggeredPrice: fromUsd(quote.priceUsd, alert.currency, usdPln),
    };
    triggered.push(fired);
    return fired;
  });
  return { alerts: triggered.length > 0 ? next : [...alerts], triggered };
}

/**
 * Próg wpisany przez człowieka → liczba albo null: „85 000,50”, „85000.5”, „1 900 zł”.
 * Spacje (także twarde) i symbol waluty są pomijane; przecinek albo kropka dziesiętna.
 */
export function parseThreshold(text: string): number | null {
  const cleaned = text
    .replace(/[\s  ]/g, "")
    .replace(/(zł|\$|usd|pln)$/i, "")
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** „BTC powyżej 70 000,00 $” */
export function describeAlert(alert: PriceAlert): string {
  const condition = alert.condition === "above" ? "powyżej" : "poniżej";
  return `${alert.symbol} ${condition} ${formatPrice(alert.threshold, alert.currency)}`;
}

/** Komunikat w pigułce po odpaleniu alertów. */
export function alertMessage(triggered: readonly PriceAlert[]): string | null {
  const [first, ...rest] = triggered;
  if (!first) return null;
  if (rest.length === 0) {
    const price = first.triggeredPrice === null ? "" : ` · teraz ${formatPrice(first.triggeredPrice, first.currency)}`;
    return `Alert: ${describeAlert(first)}${price}`;
  }
  return `Alerty: ${triggered.map((alert) => alert.symbol).join(", ")}`;
}
