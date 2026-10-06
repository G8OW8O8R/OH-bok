"use client";

import { STORED_DATA } from "@/lib/about";
import { clearLocationCookie } from "@/lib/weather/location-cookie";
import { useAlertsStore } from "@/store/alerts";
import { useMarketsStore } from "@/store/markets";
import { useRemindersStore } from "@/store/reminders";
import { useShoppingStore } from "@/store/shopping";
import { useWeatherStore } from "@/store/weather";
import { useWindowsStore } from "@/store/windows";

/**
 * „Wyczyść moje dane” (okno „O systemie”): pusty stan w store'ach, potem usunięcie wszystkich
 * kluczy i ciasteczka lokalizacji. Kolejność ma znaczenie: zmiana stanu zapisuje się od razu,
 * więc klucze kasujemy na końcu. Lista i przypomnienia zostają puste (`seeded`: przykłady
 * nie wracają w tej wizycie); przy następnej wizycie strona zaczyna jak za pierwszym razem.
 */
export function clearUserData(): void {
  useShoppingStore.setState({ items: [], seeded: true });
  useRemindersStore.setState({ reminders: [], seeded: true });
  useAlertsStore.setState({ alerts: [] });
  useWindowsStore.setState({ positions: {} });
  const markets = useMarketsStore.getInitialState();
  useMarketsStore.setState({ currency: markets.currency, fx: markets.fx });
  useWeatherStore.getState().forgetLocation();
  useWeatherStore.setState({ lastGood: null });
  clearLocationCookie();
  try {
    for (const item of STORED_DATA) if (item.where === "localStorage") window.localStorage.removeItem(item.key);
  } catch {
    // Bez dostępu do localStorage nie było też czego usuwać.
  }
}
