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
  /** Krople deszczu na szkle kuli WebGL, 0–1 (kula CSS ich nie ma). */
  rain: number;
  /** Dzisiejsza data w strefie lokalizacji (`YYYY-MM-DD`). */
  today: string;
  /** `?orb-mode=` */
  modeOverride: OrbMode | null;
  /** Klik w kulę otwiera Spotlight (zadanie 7b). */
  onActivate?: () => void;
  /** Spotlight jest otwarty (aria-expanded przycisku kuli). */
  expanded?: boolean;
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
export function Orb({ state, preview, rain, today, modeOverride, onActivate, expanded = false }: OrbProps) {
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
      data-rain={rain > 0 ? rain.toFixed(2) : undefined}
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
          rain={rain}
          reduceMotion={reduceMotion}
          forced={decision.forced}
          visible={canvasShown}
          onReady={() => setReady(true)}
          onFail={setFailure}
        />
      )}
      {onActivate && (
        <button
          type="button"
          id="orb-button"
          aria-label="Zapytaj Obok (Ctrl+K)"
          aria-haspopup="dialog"
          aria-expanded={expanded}
          onClick={onActivate}
          data-testid="orb-button"
          className="absolute inset-[4%] cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        />
      )}
      {/* Płótno jest aria-hidden: podgląd dnia ma odpowiednik tekstowy. */}
      <p role="status" className="sr-only" data-testid="orb-announcement">
        {preview ? previewAnnouncement(preview, today) : ""}
      </p>
    </div>
  );
}
