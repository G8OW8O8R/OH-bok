import { z } from "zod";

/** Stany kuli: spoczynek, asystent myśli (fale), asystent mówi (puls małej kuli). */
export const ORB_STATES = ["idle", "thinking", "speaking"] as const;
export const orbStateSchema = z.enum(ORB_STATES);
export type OrbState = z.infer<typeof orbStateSchema>;

/** Tryb renderowania: shader WebGL2 albo kula w CSS. */
export const ORB_MODES = ["webgl", "fallback"] as const;
export const orbModeSchema = z.enum(ORB_MODES);
export type OrbMode = z.infer<typeof orbModeSchema>;

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
}

/** Dev override `?orb=idle|thinking|speaking`. Nieprawidłowa wartość = spoczynek. */
export function parseOrbStateOverride(value: string | string[] | undefined): OrbState | null {
  const parsed = orbStateSchema.safeParse(first(value));
  return parsed.success ? parsed.data : null;
}

/** Dev override `?orb-mode=webgl|fallback` (wymusza tryb, pomija heurystyki i watchdog). */
export function parseOrbModeOverride(value: string | string[] | undefined): OrbMode | null {
  const parsed = orbModeSchema.safeParse(first(value));
  return parsed.success ? parsed.data : null;
}

/** Docelowe natężenie efektów stanu (0–1); pętla dochodzi do nich płynnie. */
export interface OrbTargets {
  /** Fale na powierzchni dużej kuli. */
  think: number;
  /** Puls małej kuli i bursztynowe światło w głębi dużej. */
  speak: number;
}

export function orbTargets(state: OrbState): OrbTargets {
  return {
    think: state === "thinking" ? 1 : 0,
    speak: state === "speaking" ? 1 : 0,
  };
}

/**
 * Stałe czasowe dochodzenia (s): ok. 3τ do celu. Przy reduced motion ≤ 150 ms.
 * `rain`: krople pojawiają się i wysychają w rytmie przenikania scen (1,4 s ≈ 3τ).
 */
export const ORB_TAU_S = { state: 0.18, preview: 0.12, rain: 0.45, reduced: 0.045 } as const;

/**
 * Wykładnicze dochodzenie do celu, niezależne od liczby klatek na sekundę.
 * Blisko celu przeskakuje na cel, żeby pętla mogła uznać animację za zakończoną.
 */
export function approach(current: number, target: number, dtS: number, tauS: number): number {
  if (tauS <= 0 || dtS <= 0) return dtS > 0 ? target : current;
  const next = target + (current - target) * Math.exp(-dtS / tauS);
  return Math.abs(next - target) < 1e-3 ? target : next;
}

/** Puls „mówi”: 0–1, ok. 1,2 Hz. Przy reduced motion stała jasność zamiast pulsu. */
export function speakPulse(timeS: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0.6;
  return 0.5 - 0.5 * Math.cos(timeS * Math.PI * 2 * 1.2);
}

/** Powiększenie małej kuli w szczycie pulsu (ułamek promienia). */
export const SMALL_PULSE_SCALE = 0.08;
