/** Pyłki w słońcu: stałe, rozproszone pozycje (deterministyczne, zgodne między SSR a klientem). */
const MOTES = Array.from({ length: 14 }, (_, i) => {
  const golden = (i * 0.618034) % 1;
  return {
    x: 8 + golden * 84,
    y: 12 + ((i * 37) % 70),
    size: 2 + (i % 3),
    duration: 14 + ((i * 7) % 11),
    delay: -((i * 5.3) % 20),
  };
});

interface MotesLayerProps {
  /** Złota godzina: ciepła barwa (przechodzi razem z porą dnia). */
  warm: boolean;
}

/**
 * Pyłki w słońcu (subtelne): kilkanaście punktów unoszących się animacją CSS
 * na kompozytorze. Przy reduced motion stoją.
 */
export function MotesLayer({ warm }: MotesLayerProps) {
  return (
    <div aria-hidden data-testid="motes-layer" data-warm={warm || undefined} className="motes-layer absolute inset-0">
      {MOTES.map((mote, i) => (
        <span
          key={i}
          className="mote"
          style={{
            left: `${mote.x}%`,
            top: `${mote.y}%`,
            width: mote.size,
            height: mote.size,
            animationDuration: `${mote.duration}s`,
            animationDelay: `${mote.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
