"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { coordsSchema, type Coords } from "@/lib/weather/coords";
import { weatherDataSchema, type WeatherData } from "@/lib/weather/schema";

/** Zgoda na lokalizację: `unknown` = jeszcze nie pytaliśmy (nie pytamy bez gestu). */
export type LocationConsent = "unknown" | "granted" | "denied";

interface WeatherState {
  consent: LocationConsent;
  /** Zaokrąglone współrzędne użytkownika (tylko po zgodzie). */
  coords: Coords | null;
  /** Ostatnie dobre dane: pokazywane bez sieci. */
  lastGood: WeatherData | null;
  setLocation: (coords: Coords) => void;
  setDenied: () => void;
  setLastGood: (data: WeatherData) => void;
  /** Usuwa zapisaną lokalizację (okno „O systemie”, zadanie 11). */
  forgetLocation: () => void;
}

const persistedSchema = z.object({
  consent: z.enum(["unknown", "granted", "denied"]),
  coords: coordsSchema.nullable(),
  lastGood: weatherDataSchema.nullable(),
});

type PersistedWeather = z.infer<typeof persistedSchema>;

export const useWeatherStore = create<WeatherState>()(
  persist(
    (set) => ({
      consent: "unknown",
      coords: null,
      lastGood: null,
      setLocation: (coords) => set({ coords, consent: "granted" }),
      setDenied: () => set({ coords: null, consent: "denied" }),
      setLastGood: (lastGood) => set({ lastGood }),
      forgetLocation: () => set({ coords: null, consent: "unknown" }),
    }),
    {
      name: "obok-weather",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ consent, coords, lastGood }): PersistedWeather => ({ consent, coords, lastGood }),
      // localStorage to dane z zewnątrz: uszkodzony lub stary zapis = stan domyślny, nie crash.
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      // Odczyt dopiero po hydracji, żeby HTML z serwera zgadzał się z pierwszym renderem.
      skipHydration: true,
    },
  ),
);
