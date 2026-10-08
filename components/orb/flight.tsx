"use client";

import type { MotionValue } from "motion/react";
import { createContext, useContext } from "react";

/**
 * Przesunięcie kuli poza jej miejscem w układzie (przelot do Spotlightu). Kula WebGL
 * dolicza je do pozycji, z której próbkuje scenę – jak parallax, bez pomiaru w pętli klatek.
 */
export interface OrbFlight {
  x: MotionValue<number>;
  y: MotionValue<number>;
}

const OrbFlightContext = createContext<OrbFlight | null>(null);

export const OrbFlightProvider = OrbFlightContext.Provider;

export function useOrbFlight(): OrbFlight | null {
  return useContext(OrbFlightContext);
}
