"use client";

import { LoaderCircle, Pause, Play, SkipForward } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ScenePicture } from "@/components/scene/ScenePicture";
import { Glass } from "@/components/ui/Glass";
import { getAnalyser } from "@/lib/music/engine";
import type { SceneMedia } from "@/lib/scenes";
import { currentTime, subscribeTime, useMusicStore } from "@/store/music";

interface PlayerCapsuleProps {
  /** Okładka zastępcza (brak okładki utworu, niedostępna muzyka): poster bieżącej sceny. */
  cover: SceneMedia;
}

const BARS = 44;
/** Obwiednia fali: głośniej w środku, deterministycznie (bez Math.random – SSR = klient). */
const WAVE = Array.from({ length: BARS }, (_, i) => {
  const t = i / (BARS - 1);
  const envelope = 0.3 + 0.7 * Math.sin(Math.PI * t) ** 1.4;
  const jitter = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6));
  return { height: Math.max(0.12, envelope * jitter), delay: -((i * 0.137) % 0.9) };
});

const BUTTON =
  "grid shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-text-primary transition-[background-color,scale] duration-(--dur-feedback) ease-out hover:bg-white/16 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

function useProgress(fallbackDuration: number): number {
  return useSyncExternalStore(
    subscribeTime,
    () => {
      const { position, duration } = currentTime();
      const total = duration || fallbackDuration;
      return total > 0 ? Math.min(1, position / total) : 0;
    },
    () => 0,
  );
}

/**
 * Kapsuła odtwarzacza: okładka, tytuł, artysta z linkiem do utworu na Audius,
 * play/pauza, następny, cienki pasek postępu i fala. Fala czyta widmo, gdy strumień ma CORS;
 * inaczej porusza się łagodnie, tylko podczas odtwarzania. Bez dźwięku, dopóki ktoś nie kliknie.
 */
export function PlayerCapsule({ cover }: PlayerCapsuleProps) {
  const status = useMusicStore((state) => state.status);
  const track = useMusicStore((state) => state.tracks[state.index] ?? null);
  const label = useMusicStore((state) => state.label);
  const progress = useProgress(track?.duration ?? 0);
  const playing = status === "playing";
  const active = playing || status === "buffering";
  const unavailable = status === "unavailable";
  const waveRef = useLive(playing);

  const title = unavailable ? "Muzyka chwilowo niedostępna" : (track?.title ?? "Wybieram muzykę…");

  return (
    <Glass
      id="player"
      depth="mid"
      role="region"
      aria-label="Odtwarzacz"
      data-testid="player"
      data-playing={playing}
      data-status={status}
      className="relative flex h-21 w-(--column-width) shrink-0 desk:w-[max(calc(var(--u)*21.75),19.5rem)] items-center gap-3 glass-clip rounded-pill py-2 pr-2.5 pl-2.5"
    >
      <div className="relative size-15 shrink-0 overflow-hidden rounded-[calc(var(--u)*0.9)] bg-white/10">
        {track?.artwork && !unavailable ? (
          // Okładki z hostów Audius (zmienne domeny węzłów): zwykły <img>, bez optymalizacji Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={track.artwork} src={track.artwork} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          // Poster sceny w tym samym formacie co tło (ten sam plik z pamięci podręcznej).
          <ScenePicture media={cover} loading="lazy" decoding="async" className="size-full object-cover object-[70%_50%]" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-body font-medium text-text-primary" data-testid="player-title">
          {title}
        </p>
        {unavailable ? (
          <p className="truncate text-caption text-text-secondary">Audius nie odpowiada</p>
        ) : track ? (
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Otwórz utwór na Audius"
            data-testid="player-artist"
            className="truncate text-caption text-text-secondary underline-offset-2 hover:text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-white"
          >
            {track.artist} · Audius
          </a>
        ) : (
          <p className="truncate text-caption text-text-secondary">{label}</p>
        )}
        {!unavailable && (
          <div ref={waveRef} aria-hidden data-live={active || undefined} className="mt-1 flex h-4 items-center gap-[calc(var(--u)*0.12)]">
            {WAVE.map((bar, i) => (
              <span
                key={i}
                className={`wave-bar w-[calc(var(--u)*0.12)] flex-1 rounded-full ${i / BARS < progress ? "bg-amber" : "bg-white/55"}`}
                style={{ height: `${Math.round(bar.height * 100)}%`, "--delay": `${bar.delay.toFixed(3)}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {!unavailable && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => useMusicStore.getState().next()}
            disabled={!track}
            aria-label="Następny utwór"
            className={`${BUTTON} size-9 disabled:opacity-40`}
          >
            <SkipForward aria-hidden className="size-4" fill="currentColor" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => useMusicStore.getState().toggle()}
            aria-label={active ? "Wstrzymaj" : "Odtwórz"}
            data-testid="player-toggle"
            className={`${BUTTON} size-12`}
          >
            {status === "buffering" ? (
              <LoaderCircle aria-hidden className="size-5 motion-safe:animate-spin" strokeWidth={2} />
            ) : active ? (
              <Pause aria-hidden className="size-5" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play aria-hidden className="size-5 translate-x-px" fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>
      )}

      {/* Cienki pasek postępu przy dolnej krawędzi kapsuły. */}
      {!unavailable && track && (
        <div
          role="progressbar"
          aria-label="Postęp utworu"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="pointer-events-none absolute inset-x-[12%] bottom-1.5 h-0.5 overflow-hidden rounded-full bg-white/15"
        >
          <div className="h-full origin-left rounded-full bg-amber" style={{ scale: `${progress} 1` }} />
        </div>
      )}
    </Glass>
  );
}

/**
 * Fala reagująca na dźwięk: przy dostępnym analizatorze (CORS) skala słupków z widma w każdej klatce,
 * bez przerysowań Reacta. Bez analizatora (albo przy ograniczeniu ruchu) zostaje animacja CSS.
 */
function useLive(playing: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const root = ref.current;
    const analyser = getAnalyser();
    if (!root || !playing || !analyser || reduceMotion) return;
    const bars = Array.from(root.children) as HTMLElement[];
    const data = new Uint8Array(analyser.frequencyBinCount);
    // Niskie i średnie pasma (tam jest muzyka) rozłożone symetrycznie od środka fali.
    const usable = Math.max(1, Math.floor(data.length * 0.7));
    root.dataset.analysed = "true";
    let frame = 0;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      bars.forEach((bar, i) => {
        const fromCenter = Math.abs(i - (bars.length - 1) / 2) / (bars.length / 2);
        const value = (data[Math.min(usable - 1, Math.floor(fromCenter * usable))] ?? 0) / 255;
        bar.style.scale = `1 ${(0.25 + 0.75 * value).toFixed(3)}`;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      delete root.dataset.analysed;
      bars.forEach((bar) => bar.style.removeProperty("scale"));
    };
  }, [playing, reduceMotion]);

  return ref;
}
