import { z } from "zod";

export interface Coords {
  lat: number;
  lon: number;
}

/** Fallback, gdy użytkownik nie udostępnił lokalizacji. */
export const GDANSK: Coords = { lat: 54.35, lon: 18.65 };

/**
 * Współrzędne zaokrąglamy do 0,01° (~1 km). To klucz cache (sąsiedzi dzielą wpis)
 * i ochrona prywatności: dokładna pozycja nie opuszcza przeglądarki.
 */
export function roundCoords({ lat, lon }: Coords): Coords {
  const round = (value: number) => Math.round(value * 100) / 100 + 0; // + 0 zamienia -0 na 0
  return { lat: round(lat), lon: round(lon) };
}

export function coordsKey(coords: Coords): string {
  const { lat, lon } = roundCoords(coords);
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

const coordParam = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max));

/** Parametry `?lat=&lon=` route'a pogody. */
export const coordsQuerySchema = z.object({
  lat: coordParam(-90, 90),
  lon: coordParam(-180, 180),
});

export const coordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/** Ciasteczko z zaokrągloną lokalizacją (tylko po zgodzie), żeby SSR od razu pokazał właściwą scenę. */
export const LOCATION_COOKIE = "obok-loc";
export const LOCATION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

export function serializeLocationCookie(coords: Coords): string {
  return coordsKey(coords);
}

export function parseLocationCookie(value: string | undefined): Coords | null {
  if (!value) return null;
  const [lat, lon] = value.split(",");
  const parsed = coordsQuerySchema.safeParse({ lat, lon });
  return parsed.success ? roundCoords(parsed.data) : null;
}
