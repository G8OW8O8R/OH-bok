"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion";
import type { SceneConditions } from "@/lib/scene-conditions";
import { SCENES } from "@/lib/scenes";
import { usePageHidden } from "@/lib/use-page-hidden";
import { BeamLayer } from "./BeamLayer";
import { FogLayer } from "./FogLayer";
import { LightningLayer } from "./LightningLayer";
import { MotesLayer } from "./MotesLayer";
import { PrecipitationLayer } from "./PrecipitationLayer";

interface WeatherLayersProps {
  conditions: SceneConditions;
}

interface FadeProps {
  name: string;
  /** `mix-blend-mode: screen` na opakowaniu: przenikanie tworzy własny kontekst grupy. */
  screen?: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}

/** Warstwa wchodzi i schodzi razem z przenikaniem scen (1,4 s; reduced motion ≤ 150 ms). */
function Fade({ name, screen = false, reduceMotion, children }: FadeProps) {
  const transition = { duration: reduceMotion ? duration.reducedFade : duration.sceneCrossfade, ease: ease.dissolve };
  return (
    <motion.div
      data-layer={name}
      className={`pointer-events-none absolute inset-0 ${screen ? "mix-blend-screen" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

/**
 * Warstwy pogody nad wideo: zestaw z `SCENES[state].effects`, parametry opadu
 * z warunków sceny. Leżą w `scene-stage` (pod scrimem i UI); animacje CSS pauzują
 * przy ukrytej karcie, pętle JS (opad, pioruny) stoją same.
 */
export function WeatherLayers({ conditions }: WeatherLayersProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const hidden = usePageHidden();
  const effects = SCENES[conditions.state].effects;
  const precipitation = effects.precipitation;

  return (
    <div
      className="weather-layers pointer-events-none absolute inset-0"
      data-testid="weather-layers"
      data-state={conditions.state}
      data-paused={hidden || undefined}
    >
      <AnimatePresence initial={false}>
        {effects.fog && (
          <Fade key="fog" name="fog" reduceMotion={reduceMotion}>
            <FogLayer />
          </Fade>
        )}
        {effects.lightning && (
          <Fade key="lightning" name="lightning" screen reduceMotion={reduceMotion}>
            {/* Opakowanie zawsze (ta sama struktura w SSR i po hydracji), pioruny tylko bez reduced motion. */}
            <LightningLayer enabled={!reduceMotion} />
          </Fade>
        )}
        {effects.beam && (
          <Fade key="beam" name="beam" screen reduceMotion={reduceMotion}>
            <BeamLayer />
          </Fade>
        )}
        {precipitation && (
          <Fade key={`precipitation-${precipitation}`} name="precipitation" reduceMotion={reduceMotion}>
            <PrecipitationLayer
              kind={precipitation}
              intensityMmH={conditions.intensityMmH}
              windKmh={conditions.windKmh}
              windDirectionDeg={conditions.windDirectionDeg}
              reduceMotion={reduceMotion}
            />
          </Fade>
        )}
        {effects.motes && (
          <Fade key="motes" name="motes" reduceMotion={reduceMotion}>
            <MotesLayer />
          </Fade>
        )}
      </AnimatePresence>
    </div>
  );
}
