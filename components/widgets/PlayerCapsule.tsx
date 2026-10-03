"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Glass } from "@/components/ui/Glass";
import type { Track } from "@/lib/desktop/sample";

interface PlayerCapsuleProps {
  track: Track;
  /** Miniatura: poster bieżącej sceny (utwór „o pogodzie za oknem”). */
  cover: string;
}

const BARS = 44;
/** Obwiednia fali: głośniej w środku, deterministycznie (bez Math.random – SSR = klient). */
const WAVE = Array.from({ length: BARS }, (_, i) => {
  const t = i / (BARS - 1);
  const envelope = 0.3 + 0.7 * Math.sin(Math.PI * t) ** 1.4;
  const jitter = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6));
  return { height: Math.max(0.12, envelope * jitter), delay: -((i * 0.137) % 0.9) };
});
/** Odtworzona część fali w bursztynie. */
const PLAYED = 0.42;

/**
 * Kapsuła odtwarzacza (środek) z żywą falą dźwięku. Na razie próbka bez dźwięku:
 * pauza zatrzymuje falę. Prawdziwe odtwarzanie (Audius) to zadanie „Muzyka”.
 */
export function PlayerCapsule({ track, cover }: PlayerCapsuleProps) {
  const [playing, setPlaying] = useState(true);

  return (
    <Glass
      depth="mid"
      role="region"
      aria-label="Odtwarzacz"
      data-testid="player"
      data-playing={playing}
      className="flex h-21 w-(--column-width) shrink-0 desk:w-[max(calc(var(--u)*21.75),19.5rem)] items-center gap-4 rounded-pill py-2 pr-2.5 pl-2.5"
    >
      <div className="relative size-15 shrink-0 overflow-hidden rounded-[calc(var(--u)*0.9)]">
        <Image src={cover} alt="" fill sizes="80px" className="object-cover object-[70%_50%]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate text-body font-medium text-text-primary">{track.title}</p>
        <div aria-hidden className="flex h-7 items-center gap-[calc(var(--u)*0.14)]">
          {WAVE.map((bar, i) => (
            <span
              key={i}
              className={`wave-bar w-[calc(var(--u)*0.12)] flex-1 rounded-full ${i / BARS < PLAYED ? "bg-amber" : "bg-white/55"}`}
              style={{ height: `${Math.round(bar.height * 100)}%`, "--delay": `${bar.delay.toFixed(3)}s` }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Wstrzymaj" : "Odtwórz"}
        className="grid size-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-text-primary transition-[background-color,scale] duration-(--dur-feedback) ease-out hover:bg-white/16 active:scale-95"
      >
        {playing ? (
          <Pause aria-hidden className="size-5" fill="currentColor" strokeWidth={0} />
        ) : (
          <Play aria-hidden className="size-5 translate-x-px" fill="currentColor" strokeWidth={0} />
        )}
      </button>
    </Glass>
  );
}
