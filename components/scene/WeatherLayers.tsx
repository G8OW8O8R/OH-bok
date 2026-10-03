"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { DayPeriod } from "@/lib/day-period";
import { ease } from "@/lib/motion";
import type { SceneConditions } from "@/lib/scene-conditions";
import type { SceneEffects } from "@/lib/scenes";
import { usePageHidden } from "@/lib/use-page-hidden";
import { BeamLayer } from "./BeamLayer";
import { FogLayer } from "./FogLayer";
import { LightningLayer } from "./LightningLayer";
import { MotesLayer } from "./MotesLayer";
import { PrecipitationLayer } from "./PrecipitationLayer";

interface WeatherLayersProps {
  conditions: SceneConditions;
  /** Zestaw warstw sceny pogoda × pora (`resolveScene(...).effects`). */
  effects: SceneEffects;
  period: DayPeriod;
  /** Czas przenikania sceny w sekundach (`sceneDuration`). */
  transitionS: number;
  /** Zmienna `--dur-scene` przy wolnym przejściu pory (przejścia CSS: mgła, pyłki). */
  durationStyle?: CSSProperties;
}

interface FadeProps {
  name: string;
  /** `mix-blend-mode: screen` na opakowaniu: przenikanie tworzy własny kontekst grupy. */
  screen?: boolean;
  transitionS: number;
  children: ReactNode;
}

/** Warstwa wchodzi i schodzi razem z przenikaniem scen (1,4 s, 15 s przy zmianie pory; reduced motion ≤ 150 ms). */
function Fade({ name, screen = false, transitionS, children }: FadeProps) {
  const transition = { duration: transitionS, ease: ease.dissolve };
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
 * Warstwy pogody nad wideo: zestaw ze sceny pogoda × pora, parametry opadu
 * z warunków sceny. Leżą w `scene-stage` (pod scrimem i UI); animacje CSS pauzują
 * przy ukrytej karcie, pętle JS (opad, pioruny) stoją same.
 */
export function WeatherLayers({ conditions, effects, period, transitionS, durationStyle }: WeatherLayersProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const hidden = usePageHidden();
  const precipitation = effects.precipitation;

  return (
    <div
      className="weather-layers pointer-events-none absolute inset-0"
      data-testid="weather-layers"
      data-state={conditions.state}
      data-period={period}
      data-paused={hidden || undefined}
      style={durationStyle}
    >
      <AnimatePresence initial={false}>
        {effects.fog && (
          <Fade key="fog" name="fog" transitionS={transitionS}>
            <FogLayer />
          </Fade>
        )}
        {effects.lightning && (
          <Fade key="lightning" name="lightning" screen transitionS={transitionS}>
            {/* Opakowanie zawsze (ta sama struktura w SSR i po hydracji), pioruny tylko bez reduced motion. */}
            <LightningLayer enabled={!reduceMotion} />
          </Fade>
        )}
        {effects.beam && (
          <Fade key="beam" name="beam" screen transitionS={transitionS}>
            <BeamLayer />
          </Fade>
        )}
        {precipitation && (
          <Fade key={`precipitation-${precipitation}`} name="precipitation" transitionS={transitionS}>
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
          <Fade key="motes" name="motes" transitionS={transitionS}>
            <MotesLayer warm={period === "golden"} />
          </Fade>
        )}
      </AnimatePresence>
    </div>
  );
}
