"use client";

import { useReducedMotion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { chooseOrbMode, type FallbackReason, type OrbModeDecision } from "@/lib/orb/capability";
import { previewAnnouncement, previewImage } from "@/lib/orb/preview";
import type { OrbMode, OrbState } from "@/lib/orb/states";
import type { DailyForecast } from "@/lib/weather/schema";
import { OrbCanvas } from "./OrbCanvas";
import { OrbFallback } from "./OrbFallback";

interface OrbProps {
  state: OrbState;
  /** Dzień z prognozy, którego pogodę pokazuje kula (kryształowa kula); null = scena. */
  preview: DailyForecast | null;
  /** Dzisiejsza data w strefie lokalizacji (`YYYY-MM-DD`). */
  today: string;
  /** `?orb-mode=` */
  modeOverride: OrbMode | null;
}

const noopSubscribe = () => () => {};
const decisions = new Map<OrbMode | null, OrbModeDecision>();

/** Decyzja zależy tylko od urządzenia: liczona raz (stabilna migawka dla useSyncExternalStore). */
function clientDecision(override: OrbMode | null): OrbModeDecision {
  let decision = decisions.get(override);
  if (!decision) {
    const nav: Navigator & { deviceMemory?: number } = navigator;
    decision = chooseOrbMode(override, {
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: nav.hardwareConcurrency || undefined,
    });
    decisions.set(override, decision);
  }
  return decision;
}

/**
 * Kula „Obok”. Serwer renderuje kulę w CSS; w przeglądarce, jeśli urządzenie
 * daje radę, nad nią pojawia się płótno WebGL2 z refrakcją sceny. Każdy problem
 * (brak WebGL2, utrata kontekstu, za wolne klatki) wraca do kuli w CSS.
 */
export function Orb({ state, preview, today, modeOverride }: OrbProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const decision = useSyncExternalStore(
    noopSubscribe,
    () => clientDecision(modeOverride),
    () => null,
  );
  const [failure, setFailure] = useState<FallbackReason | null>(null);
  const [ready, setReady] = useState(false);

  const webgl = decision?.mode === "webgl" && failure === null;
  const mode = decision === null ? "pending" : webgl ? "webgl" : "fallback";
  const canvasShown = webgl && ready;
  const image = preview ? previewImage(preview) : null;
  const reason = failure ?? (decision?.mode === "fallback" ? decision.reason : undefined);

  return (
    <div
      data-testid="orb"
      data-mode={mode}
      data-state={state}
      data-ready={canvasShown}
      data-fallback-reason={reason}
      className="orb-root relative size-(--orb-size) shrink-0"
    >
      {/* Cień głębi wspólny dla obu wersji (płótno rysuje tylko szkło). */}
      <div aria-hidden className="orb-shadow absolute inset-0" />
      <div aria-hidden className="orb-shadow absolute right-[-2%] bottom-[2%] size-[21%]" />
      <OrbFallback state={state} preview={canvasShown ? null : image} hidden={canvasShown} />
      {webgl && (
        <OrbCanvas
          state={state}
          preview={image}
          reduceMotion={reduceMotion}
          forced={decision.forced}
          visible={canvasShown}
          onReady={() => setReady(true)}
          onFail={setFailure}
        />
      )}
      {/* Płótno jest aria-hidden: podgląd dnia ma odpowiednik tekstowy. */}
      <p role="status" className="sr-only" data-testid="orb-announcement">
        {preview ? previewAnnouncement(preview, today) : ""}
      </p>
    </div>
  );
}
