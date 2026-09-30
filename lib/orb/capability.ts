import type { OrbMode } from "./states";

/**
 * Wybór trybu kuli przed utworzeniem kontekstu WebGL. Brak WebGL2, programowe renderowanie
 * (`failIfMajorPerformanceCaveat`) i utrata kontekstu wychodzą dopiero przy próbie,
 * a zbyt wolne klatki – z watchdoga (fps-watchdog.ts).
 */

export type FallbackReason = "forced" | "low-memory" | "few-cores" | "no-webgl2" | "context-lost" | "slow";

export interface DeviceHints {
  /** `navigator.deviceMemory` (GB, tylko Chromium; zaokrąglane w dół do potęgi 2, maks. 8). */
  deviceMemory?: number;
  /** `navigator.hardwareConcurrency` (wątki logiczne). */
  hardwareConcurrency?: number;
}

/** Progi słabego urządzenia: 4 GB pamięci lub 4 wątki i mniej. */
export const WEAK_DEVICE = { memoryGb: 4, cores: 4 } as const;

export type OrbModeDecision = { mode: "webgl"; forced: boolean } | { mode: "fallback"; reason: FallbackReason };

export function chooseOrbMode(override: OrbMode | null, hints: DeviceHints): OrbModeDecision {
  if (override === "fallback") return { mode: "fallback", reason: "forced" };
  if (override === "webgl") return { mode: "webgl", forced: true };
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= WEAK_DEVICE.memoryGb) {
    return { mode: "fallback", reason: "low-memory" };
  }
  if (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= WEAK_DEVICE.cores) {
    return { mode: "fallback", reason: "few-cores" };
  }
  return { mode: "webgl", forced: false };
}
