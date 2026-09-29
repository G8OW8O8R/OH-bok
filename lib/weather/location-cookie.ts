import { LOCATION_COOKIE, LOCATION_COOKIE_MAX_AGE_S, serializeLocationCookie, type Coords } from "./coords";

/** Zapis w przeglądarce: ciasteczko własne, tylko zaokrąglone współrzędne (~1 km), tylko po zgodzie. */
export function writeLocationCookie(coords: Coords): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCATION_COOKIE}=${serializeLocationCookie(coords)}; Path=/; Max-Age=${LOCATION_COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`;
}

export function clearLocationCookie(): void {
  document.cookie = `${LOCATION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
