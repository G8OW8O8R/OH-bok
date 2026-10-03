import type { CSSProperties } from "react";

interface ScrimProps {
  /** `scrimStrength` z tokenów sceny (0–1). */
  strength: number;
  /** `vignetteStrength` z tokenów sceny (0–1): górna krawędź i prawy górny narożnik. */
  vignette: number;
  /** `--dur-scene` przy wolnym przejściu pory dnia. */
  durationStyle?: CSSProperties;
}

/**
 * Winieta pod tekstem po lewej i winieta górnej krawędzi pod logo, pigułką
 * i zegarem. Siły są zarejestrowanymi właściwościami CSS (`@property`), więc przy
 * zmianie sceny przechodzą płynnie razem z przenikaniem wideo.
 */
export function Scrim({ strength, vignette, durationStyle }: ScrimProps) {
  return (
    <div
      aria-hidden
      data-testid="scrim"
      className="scrim pointer-events-none fixed inset-0 -z-[5]"
      style={{ ...durationStyle, "--scrim-strength": strength, "--vignette-strength": vignette }}
    />
  );
}
