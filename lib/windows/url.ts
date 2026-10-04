import { APPS, appFromSlug, type AppId } from "./apps";
import type { WindowStack } from "./stack";

/** `?app=pogoda` albo `?app=pogoda,lista` (ostatnie = na wierzchu). */
export const APP_PARAM = "app";

/** Stos okien z adresu: nieznane nazwy pomijane, powtórzenia liczą się raz (ostatnie wystąpienie). */
export function parseAppParam(value: string | null | undefined): WindowStack {
  if (!value) return [];
  const ids = value
    .split(",")
    .map(appFromSlug)
    .filter((id): id is AppId => id !== null);
  return ids.filter((id, i) => ids.lastIndexOf(id) === i);
}

export function stackFromSearch(search: string): WindowStack {
  return parseAppParam(new URLSearchParams(search).get(APP_PARAM));
}

/**
 * Adres ze stosem okien, z zachowaniem pozostałych parametrów (`?weather=`, `?boot=`…).
 * Przecinek zostaje czytelny (link do wysłania), nazwy aplikacji nie wymagają kodowania.
 */
export function searchWithStack(search: string, stack: WindowStack): string {
  const params = new URLSearchParams(search);
  params.delete(APP_PARAM);
  const rest = params.toString();
  const apps = stack.length > 0 ? `${APP_PARAM}=${stack.map((id) => APPS[id].slug).join(",")}` : "";
  const query = [rest, apps].filter(Boolean).join("&");
  return query ? `?${query}` : "";
}

/**
 * Jak zamknąć okno w historii. Wpis dodany przy otwarciu tego okna (i okno nadal na wierzchu) =
 * `back`: przycisk, Esc i „wstecz” dają ten sam stan historii. Okno z linku albo nie z wierzchu =
 * `replace`: zamknięcie nie cofa użytkownika poza stronę ani nie otwiera z powrotem innych okien.
 */
export function closeNavigation(stack: WindowStack, id: AppId, entryOpenedApp: unknown): "back" | "replace" {
  return stack[stack.length - 1] === id && entryOpenedApp === id ? "back" : "replace";
}
