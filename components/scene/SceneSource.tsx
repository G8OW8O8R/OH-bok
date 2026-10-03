"use client";

import { useMotionValue, type MotionValue } from "motion/react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SceneTokens, SceneVideoId } from "@/lib/scenes";

/**
 * Wspólne źródło sceny: wszystko, co musi pokazywać dokładnie to samo co tło
 * (kula z refrakcją, później warstwy pogody), czyta stąd te same klatki, ten sam
 * postęp przenikania i ten sam grading, zamiast odtwarzać je po swojemu.
 */

export interface SceneLayerHandle {
  id: number;
  video: SceneVideoId;
  /** Krycie warstwy w przenikaniu scen (warstwa bazowa = 1). */
  opacity: MotionValue<number>;
  poster: HTMLImageElement | null;
  element: HTMLVideoElement | null;
  /** Wideo zakryło poster (od klatki 0), więc można próbkować wideo. */
  revealed: boolean;
}

/** Rejestr warstw bez re-renderów: odbiorcy czytają go w swojej pętli klatek. */
export class SceneLayerRegistry {
  private readonly layers = new Map<number, SceneLayerHandle>();
  private sorted: SceneLayerHandle[] = [];
  /** Rośnie przy każdej zmianie, żeby odbiorca wiedział, kiedy przeliczyć źródła. */
  version = 0;

  set(handle: SceneLayerHandle): void {
    this.layers.set(handle.id, handle);
    this.changed();
  }

  remove(id: number): void {
    if (this.layers.delete(id)) this.changed();
  }

  /** Warstwy od spodu: bazowa, potem wchodząca (najwyżej dwie, lib/scene-transition.ts). */
  list(): readonly SceneLayerHandle[] {
    return this.sorted;
  }

  private changed(): void {
    this.sorted = [...this.layers.values()].sort((a, b) => a.id - b.id);
    this.version += 1;
  }
}

export interface SceneSourceValue {
  layers: SceneLayerRegistry;
  /** Grading sceny (tokeny `videoFilter`), płynnie przechodzący razem z przenikaniem. */
  brightness: MotionValue<number>;
  saturate: MotionValue<number>;
  /** Barwa sceny (token `tint`, mnożniki kanałów): chłodniejsza noc na planszy deszczu. */
  tintR: MotionValue<number>;
  tintG: MotionValue<number>;
  tintB: MotionValue<number>;
  /** Siła ciepłego gradientu złotej godziny (token `warmth`, 0–1). */
  warmth: MotionValue<number>;
  /** Jasność błysku pioruna, 0–1 (LightningLayer, zadanie 6). Rozjaśnia tło i kulę. */
  flash: MotionValue<number>;
}

const SceneSourceContext = createContext<SceneSourceValue | null>(null);

interface SceneSourceProviderProps {
  /** Grading sceny z pierwszego renderu: bez animacji od wartości domyślnych przy starcie. */
  initialGrade: Pick<SceneTokens, "videoFilter" | "tint" | "warmth">;
  children: ReactNode;
}

export function SceneSourceProvider({ initialGrade, children }: SceneSourceProviderProps) {
  const [layers] = useState(() => new SceneLayerRegistry());
  const brightness = useMotionValue(initialGrade.videoFilter.brightness);
  const saturate = useMotionValue(initialGrade.videoFilter.saturate);
  const tintR = useMotionValue(initialGrade.tint[0]);
  const tintG = useMotionValue(initialGrade.tint[1]);
  const tintB = useMotionValue(initialGrade.tint[2]);
  const warmth = useMotionValue(initialGrade.warmth);
  const flash = useMotionValue(0);
  const value = useMemo(
    () => ({ layers, brightness, saturate, tintR, tintG, tintB, warmth, flash }),
    [layers, brightness, saturate, tintR, tintG, tintB, warmth, flash],
  );
  return <SceneSourceContext value={value}>{children}</SceneSourceContext>;
}

export function useSceneSource(): SceneSourceValue {
  const context = useContext(SceneSourceContext);
  if (!context) throw new Error("SceneSource: brak <SceneSourceProvider> wyżej w drzewie.");
  return context;
}
