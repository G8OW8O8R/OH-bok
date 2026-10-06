"use client";

import { useState } from "react";
import { PREVIEW_FOCUS, type OrbPreviewImage } from "@/lib/orb/preview";
import type { OrbState } from "@/lib/orb/states";
import { SCENE_MEDIA, toCssFilter } from "@/lib/scenes";
import { ScenePicture } from "@/components/scene/ScenePicture";

interface OrbFallbackProps {
  state: OrbState;
  /** Podgląd dnia; null = scena. Przekazywany tylko, gdy ta wersja kuli jest widoczna. */
  preview: OrbPreviewImage | null;
  hidden: boolean;
}

function samePreview(a: OrbPreviewImage | null, b: OrbPreviewImage | null): boolean {
  return (
    a?.poster === b?.poster &&
    a?.grading.brightness === b?.grading.brightness &&
    a?.grading.saturate === b?.grading.saturate
  );
}

/**
 * Kula w CSS: pierwsza klatka przed WebGL (SSR), wersja dla słabszych urządzeń i po utracie
 * kontekstu. Szkło z refleksem i bursztynowym rim light, podgląd dnia jako poster w kole,
 * stany „myśli” (rozchodzące się kręgi) i „mówi” (puls małej kuli, bursztyn w głębi).
 */
export function OrbFallback({ state, preview, hidden }: OrbFallbackProps) {
  // Ostatni podgląd zostaje w DOM, żeby mógł się płynnie schować.
  const [shown, setShown] = useState<OrbPreviewImage | null>(preview);
  if (preview && !samePreview(preview, shown)) setShown(preview);

  return (
    <div
      aria-hidden
      data-testid="orb-fallback"
      data-state={state}
      data-hidden={hidden}
      className="orb-fallback absolute inset-0"
    >
      {shown && (
        <div
          className="orb-preview absolute inset-0 overflow-hidden rounded-full"
          data-testid="orb-preview"
          data-visible={preview !== null}
        >
          <ScenePicture
            media={SCENE_MEDIA[shown.video]}
            decoding="async"
            className="absolute inset-0 size-full object-cover"
            style={{
              objectPosition: `${PREVIEW_FOCUS.x * 100}% ${PREVIEW_FOCUS.y * 100}%`,
              filter: toCssFilter(shown.grading),
            }}
          />
        </div>
      )}
      <div className="orb size-full">
        <span className="orb-ripple" />
        <span className="orb-ripple [animation-delay:-0.9s]" />
        <span className="orb-glow" />
      </div>
      <div className="orb orb-small absolute right-[-2%] bottom-[2%] size-[21%]" />
    </div>
  );
}
