import type { BezierDefinition, Transition } from "motion/react";

/** Krzywe. Lustro zmiennych --ease-* w styles/tokens.css. */
export const ease = {
  /** wejścia */
  out: [0.16, 1, 0.3, 1],
  /** teksty, przenikania */
  soft: [0.22, 0.61, 0.36, 1],
  /** rysowanie linii */
  pen: [0.37, 0.01, 0.2, 1],
  /** symetryczne przenikanie obrazu w obraz (sceny, poster → wideo) */
  dissolve: [0.45, 0, 0.55, 1],
} as const satisfies Record<string, BezierDefinition>;

export const spring = {
  default: { type: "spring", stiffness: 380, damping: 32 },
  gentle: { type: "spring", stiffness: 220, damping: 26 },
  snappy: { type: "spring", stiffness: 600, damping: 38 },
} as const satisfies Record<string, Transition>;

/** Czasy w sekundach (konwencja Motion). */
export const duration = {
  feedback: 0.24,
  /** górny limit przenikań przy prefers-reduced-motion */
  reducedFade: 0.15,
  sceneCrossfade: 1.4,
  /** poster → pierwsza klatka wideo */
  posterHandoff: 0.2,
} as const;
