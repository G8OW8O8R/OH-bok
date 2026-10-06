import { z } from "zod";

/** Aplikacje, które mają okno. Dock pokazuje tylko te, które istnieją. */
export const APP_IDS = ["weather", "shopping", "reminders", "markets", "news", "about"] as const;
export const appIdSchema = z.enum(APP_IDS);
export type AppId = z.infer<typeof appIdSchema>;

interface AppInfo {
  title: string;
  /** Nazwa w adresie (`?app=pogoda`): po polsku, bo link wysyła się ludziom. */
  slug: string;
  /** false = poza dockiem (okno otwiera inny element, `opener`). */
  dock: boolean;
  /** Element, do którego wraca fokus po zamknięciu okna otwartego z linku (domyślnie ikona docka). */
  opener?: string;
}

export const APPS: Record<AppId, AppInfo> = {
  weather: { title: "Pogoda", slug: "pogoda", dock: true },
  shopping: { title: "Lista zakupów", slug: "lista", dock: true },
  reminders: { title: "Przypomnienia", slug: "przypomnienia", dock: true },
  markets: { title: "Rynki", slug: "rynki", dock: true },
  news: { title: "Wiadomości", slug: "wiadomosci", dock: true },
  // Okno informacyjne: otwiera je logo (i Spotlight), w docku zostają aplikacje użytkowe.
  about: { title: "O systemie", slug: "o-systemie", dock: false, opener: "logo-button" },
};

const BY_SLUG = new Map<string, AppId>(APP_IDS.map((id) => [APPS[id].slug, id]));

export function appFromSlug(slug: string): AppId | null {
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

/** Skąd okno się otwiera: z tego elementu rozwija się przejściem współdzielonym (`layoutId`). */
export type WindowOrigin = "dock" | "tile" | "spotlight";

/** Element, do którego wraca fokus po zamknięciu okna otwartego z linku. */
export function openerElementId(id: AppId): string {
  return APPS[id].opener ?? `dock-${id}`;
}

export function originLayoutId(id: AppId, origin: WindowOrigin): string {
  return `${origin}-${id}`;
}
