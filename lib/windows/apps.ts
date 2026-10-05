import { z } from "zod";

/** Aplikacje, które mają okno. Dock pokazuje tylko te, które istnieją. */
export const APP_IDS = ["weather", "shopping", "reminders", "markets", "news"] as const;
export const appIdSchema = z.enum(APP_IDS);
export type AppId = z.infer<typeof appIdSchema>;

interface AppInfo {
  title: string;
  /** Nazwa w adresie (`?app=pogoda`): po polsku, bo link wysyła się ludziom. */
  slug: string;
}

export const APPS: Record<AppId, AppInfo> = {
  weather: { title: "Pogoda", slug: "pogoda" },
  shopping: { title: "Lista zakupów", slug: "lista" },
  reminders: { title: "Przypomnienia", slug: "przypomnienia" },
  markets: { title: "Rynki", slug: "rynki" },
  news: { title: "Wiadomości", slug: "wiadomosci" },
};

const BY_SLUG = new Map<string, AppId>(APP_IDS.map((id) => [APPS[id].slug, id]));

export function appFromSlug(slug: string): AppId | null {
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

/** Skąd okno się otwiera: z tego elementu rozwija się przejściem współdzielonym (`layoutId`). */
export type WindowOrigin = "dock" | "tile" | "spotlight";

export function originLayoutId(id: AppId, origin: WindowOrigin): string {
  return `${origin}-${id}`;
}
