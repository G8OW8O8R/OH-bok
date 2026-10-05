"use client";

import { animate } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { documentVisibility } from "@/lib/frame-loop";
import { browserClock, flashKeyframes, LightningScheduler } from "@/lib/lightning";
import { computeSceneFit, SCENE_MEDIA_SIZE } from "@/lib/scene-fit";
import { useSceneSource } from "./SceneSource";

const BOLTS = [1, 2, 3] as const;
type BoltVariant = 720 | 1440;

/** Wersja 1440 dopiero, gdy pudełko kadru ma wyraźnie więcej niż 1280 pikseli fizycznych szerokości. */
const HIRES_FROM_PX = 1600;

function chooseVariant(): BoltVariant {
  const root = document.documentElement;
  const dpr = window.devicePixelRatio || 1;
  const fit = computeSceneFit(root.clientWidth, root.clientHeight, dpr);
  return fit.width * dpr > HIRES_FROM_PX ? 1440 : 720;
}

/**
 * Burza: błyski w losowych odstępach (lib/lightning.ts). Obraz pioruna stoi w tym
 * samym pudełku kadru co wideo (`.scene-media`), więc trafia w horyzont przy każdych
 * proporcjach ekranu; czarne tło znika przez `mix-blend-mode: screen` (na opakowaniu warstwy
 * w WeatherLayers: przenikanie tworzy własny kontekst, w którym screen nie miałby tła). Jasność błysku
 * idzie do wspólnego `flash` (tło + kula). Przy reduced motion nie renderuje niczego.
 */
interface LightningLayerProps {
  /** false przy reduced motion: żadnych błysków ani obrazów piorunów (WCAG 2.3.1). */
  enabled: boolean;
}

export function LightningLayer({ enabled }: LightningLayerProps) {
  const { flash } = useSceneSource();
  const rootRef = useRef<HTMLDivElement>(null);
  const bolts = useRef<(HTMLImageElement | null)[]>([]);
  // Wariant zależy od ekranu: wybierany po montażu (warstwa i tak nie istnieje w SSR).
  const [variant, setVariant] = useState<BoltVariant | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVariant(enabled ? chooseVariant() : null));
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || variant === null) return;
    const images = bolts.current;
    let strikes = 0;
    const running: { stop: () => void }[] = [];
    const scheduler = new LightningScheduler({
      clock: browserClock(),
      visibility: documentVisibility(),
      boltCount: BOLTS.length,
      onStrike: (strike) => {
        const { values, times, duration } = flashKeyframes(strike);
        const options = { duration: duration / 1000, times, ease: "linear" as const };
        running.splice(0).forEach((control) => control.stop());
        running.push(animate(flash, values, options));
        const bolt = strike.bolt === null ? null : images[strike.bolt];
        if (bolt) running.push(animate(bolt, { opacity: values.map((v) => Math.min(1, v)) }, options));
        strikes += 1;
        if (rootRef.current) rootRef.current.dataset.strikes = String(strikes);
      },
    });
    scheduler.setEnabled(true);
    return () => {
      scheduler.dispose();
      running.forEach((control) => control.stop());
      flash.jump(0);
      for (const bolt of images) if (bolt) bolt.style.opacity = "0";
    };
  }, [enabled, variant, flash]);

  if (!enabled || variant === null) return null;
  const scale = variant / SCENE_MEDIA_SIZE.height;
  return (
    <div ref={rootRef} aria-hidden data-testid="lightning-layer" data-strikes="0" className="lightning-layer absolute inset-0">
      {BOLTS.map((n, i) => (
        <Image
          key={n}
          ref={(el) => {
            bolts.current[i] = el;
          }}
          className="scene-media lightning-bolt"
          data-testid="lightning-bolt"
          src={`/scenes/storm/bolt-${n}-${variant}.webp`}
          alt=""
          width={SCENE_MEDIA_SIZE.width * scale}
          height={SCENE_MEDIA_SIZE.height * scale}
          // Obraz jest dopasowany do klatki co do piksela: bez przekodowania przez optymalizator.
          unoptimized
          loading="eager"
          draggable={false}
          style={{ opacity: 0 }}
        />
      ))}
    </div>
  );
}
