"use client";

import { formatClock } from "@/lib/time";

interface ClockProps {
  now: Date;
  timeZone: string;
}

/** Data · godzina w prawym górnym rogu, bez paska. Czytelność zapewnia winieta narożnika (Scrim). */
export function Clock({ now, timeZone }: ClockProps) {
  return (
    <p className="scene-text justify-self-end text-body font-medium text-text-primary tabular-nums">
      <time dateTime={now.toISOString()}>
        {formatClock(now, timeZone)}
      </time>
    </p>
  );
}
