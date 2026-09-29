interface ScrimProps {
  /** `scrimStrength` z tokenów sceny (0–1). */
  strength: number;
}

/**
 * Winieta pod tekstem po lewej. Siła jest zarejestrowaną właściwością CSS
 * (`@property --scrim-strength`), więc przy zmianie sceny przechodzi płynnie
 * razem z przenikaniem wideo.
 */
export function Scrim({ strength }: ScrimProps) {
  return (
    <div
      aria-hidden
      data-testid="scrim"
      className="scrim pointer-events-none fixed inset-0 -z-[5]"
      style={{ "--scrim-strength": strength }}
    />
  );
}
