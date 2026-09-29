"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useWeatherStore } from "@/store/weather";
import { isWorthKeeping, resolveClientWeather } from "./client-fallback";
import { roundCoords, type Coords } from "./coords";
import { clearLocationCookie, writeLocationCookie } from "./location-cookie";
import { weatherDataSchema, type WeatherData } from "./schema";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** Powrót do karty odświeża dane, ale nie częściej niż raz na minutę. */
const MIN_REFRESH_GAP_MS = 60 * 1000;
const GEO_TIMEOUT_MS = 10_000;
/**
 * SSR dostał nieświeże dane (cache danych serwuje stary wpis i odświeża go w tle):
 * po chwili pytamy ponownie, zwykle jest już świeży.
 */
const STALE_RETRY_MS = 1500;

export interface UseWeatherResult {
  weather: WeatherData;
  locating: boolean;
  locationError: string | null;
  /** Poproś o lokalizację. Wywoływać tylko z gestu użytkownika. */
  locate: () => void;
}

function isNewer(candidate: WeatherData, than: WeatherData | null): boolean {
  return !than || Date.parse(candidate.fetchedAt) > Date.parse(than.fetchedAt);
}

async function geolocationAlreadyGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state === "granted";
  } catch {
    // Brak Permissions API (starsze Safari): nie pytamy bez gestu.
    return false;
  }
}

/**
 * Pogoda po stronie klienta. Start od danych z SSR, lokalizacja tylko za zgodą
 * (po cichu, jeśli zgoda już jest), odświeżanie co 30 min, po powrocie do karty
 * i po odzyskaniu sieci. Bez sieci: ostatnie dobre dane z localStorage albo demo.
 */
export function useWeather(initial: WeatherData): UseWeatherResult {
  const [weather, setWeather] = useState(initial);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const staleRetry = useRef<number | undefined>(undefined);

  const load = useCallback(async (coords: Coords | null) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    lastAttempt.current = Date.now();

    let fetched: WeatherData | null = null;
    try {
      const url = coords ? `/api/weather?lat=${coords.lat}&lon=${coords.lon}` : "/api/weather";
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        const parsed = weatherDataSchema.safeParse(await response.json());
        if (parsed.success) fetched = parsed.data;
      }
    } catch {
      // Brak sieci albo przerwane zapytanie: niżej zdecyduje resolveClientWeather.
    }
    if (controller.signal.aborted) return;

    const { lastGood, setLastGood } = useWeatherStore.getState();
    if (fetched && isWorthKeeping(fetched) && isNewer(fetched, lastGood)) setLastGood(fetched);
    setWeather(resolveClientWeather({ fetched, lastGood, now: new Date() }));
  }, []);

  const requestPosition = useCallback(
    (mode: "user" | "silent") => {
      if (!("geolocation" in navigator)) {
        if (mode === "user") setLocationError("Ta przeglądarka nie udostępnia lokalizacji.");
        return;
      }
      setLocating(true);
      setLocationError(null);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = roundCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
          useWeatherStore.getState().setLocation(coords);
          writeLocationCookie(coords);
          setLocating(false);
          void load(coords);
        },
        (error) => {
          setLocating(false);
          if (error.code === error.PERMISSION_DENIED) {
            useWeatherStore.getState().setDenied();
            clearLocationCookie();
            if (mode === "user") setLocationError("Brak zgody na lokalizację – pokazuję pogodę dla Gdańska.");
          } else if (mode === "user") {
            setLocationError("Nie udało się ustalić lokalizacji. Spróbuj ponownie za chwilę.");
          }
        },
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: REFRESH_INTERVAL_MS },
      );
    },
    [load],
  );

  const onRehydrated = useEffectEvent(() => {
    const { lastGood, setLastGood, consent } = useWeatherStore.getState();

    if (isWorthKeeping(initial) && isNewer(initial, lastGood)) setLastGood(initial);
    // SSR mógł dostać demo (Open-Meteo leżało): lokalna kopia jest lepsza.
    if (initial.source === "demo") {
      setWeather(resolveClientWeather({ fetched: initial, lastGood, now: new Date() }));
    }
    if (initial.source !== "live") {
      staleRetry.current = window.setTimeout(() => void load(useWeatherStore.getState().coords), STALE_RETRY_MS);
    }
    if (consent !== "denied") {
      void geolocationAlreadyGranted().then((granted) => {
        if (granted) requestPosition("silent");
      });
    }
  });

  // localStorage czytamy dopiero po hydracji (store ma skipHydration).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(useWeatherStore.persist.rehydrate()).then(() => {
      if (!cancelled) onRehydrated();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const coords = () => useWeatherStore.getState().coords;
    const onVisibility = () => {
      if (!document.hidden && Date.now() - lastAttempt.current > MIN_REFRESH_GAP_MS) void load(coords());
    };
    // Utrata sieci: od razu pokaż, że dane pochodzą z pamięci.
    const onOffline = () => {
      const { lastGood } = useWeatherStore.getState();
      setWeather(resolveClientWeather({ fetched: null, lastGood, now: new Date() }));
    };
    const onOnline = () => void load(coords());
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(coords());
    }, REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(staleRetry.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      inFlight.current?.abort();
    };
  }, [load]);

  const locate = useCallback(() => requestPosition("user"), [requestPosition]);

  return { weather, locating, locationError, locate };
}
