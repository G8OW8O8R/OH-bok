"use client";

import { useEffect, useRef } from "react";
import { animationFrames, documentVisibility, FrameLoop } from "@/lib/frame-loop";
import { approach } from "@/lib/orb/states";
import {
  activeRanges,
  createField,
  FAR,
  fieldCapacity,
  NEAR,
  particleCounts,
  resizeField,
  stepField,
  windSlant,
  type DepthLayer,
  type ParticleCounts,
  type ParticleField,
} from "@/lib/precipitation";
import type { PrecipitationKind } from "@/lib/scenes";

interface PrecipitationLayerProps {
  kind: PrecipitationKind;
  intensityMmH: number;
  windKmh: number;
  windDirectionDeg: number | null;
  reduceMotion: boolean;
}

/** Gęstość i kąt dochodzą do nowej wartości w rytmie przenikania scen (1,4 s ≈ 3τ). */
const RETARGET_TAU_S = 0.45;

/** Wygląd warstw: daleko cienko i wyraźniej, blisko szerzej i bardziej przezroczyście (pozorne rozmycie). */
const STYLE: Record<PrecipitationKind, Record<DepthLayer, { color: string; width: number }>> = {
  rain: {
    [FAR]: { color: "rgba(214, 224, 236, 0.3)", width: 1 },
    [NEAR]: { color: "rgba(222, 230, 240, 0.15)", width: 2.4 },
  },
  snow: {
    [FAR]: { color: "rgba(255, 255, 255, 0.55)", width: 0 },
    [NEAR]: { color: "rgba(255, 255, 255, 0.42)", width: 0 },
  },
};

/** Element, za którym opad słabnie (powitanie z briefem). */
const HEADER_SELECTOR = ".desktop-hero-text";

/**
 * Deszcz albo śnieg: jedno płótno 2D, dwie warstwy głębi, każda rysowana jedną
 * ścieżką. Gęstość z mm/h, kąt z wiatru. Bufor w pikselach CSS (opad i tak jest miękki),
 * maska CSS osłabia opad za powitaniem. Pętla stoi przy ukrytej karcie; przy reduced
 * motion rysowana jest jedna nieruchoma klatka.
 */
export function PrecipitationLayer({ kind, intensityMmH, windKmh, windDirectionDeg, reduceMotion }: PrecipitationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ intensityMmH, slant: windSlant(kind, windKmh, windDirectionDeg), reduceMotion });
  /** Synchronizacja trybu (pętla albo nieruchoma klatka) po zmianie propsów. */
  const sync = useRef<(() => void) | null>(null);

  useEffect(() => {
    target.current = { intensityMmH, slant: windSlant(kind, windKmh, windDirectionDeg), reduceMotion };
    sync.current?.();
  }, [kind, intensityMmH, windKmh, windDirectionDeg, reduceMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let field: ParticleField | null = null;
    let active: ParticleCounts = { far: 0, near: 0 };
    let slant = target.current.slant;
    let time = 0;

    const desired = (): ParticleCounts =>
      particleCounts(kind, target.current.intensityMmH, canvas.width * canvas.height);

    const draw = () => {
      if (!field) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ranges = activeRanges(field, active);
      // Kierunek smugi: przeciwny do ruchu, długość niezależna od nachylenia.
      const norm = 1 / Math.hypot(1, slant);
      for (const layer of [FAR, NEAR] as const) {
        const [from, to] = ranges[layer];
        if (to <= from) continue;
        const style = STYLE[kind][layer];
        ctx.beginPath();
        for (let i = from; i < to; i++) {
          const x = field.x[i]!;
          const y = field.y[i]!;
          const size = field.size[i]!;
          if (kind === "rain") {
            ctx.moveTo(x, y);
            ctx.lineTo(x - slant * size * norm, y - size * norm);
          } else {
            ctx.moveTo(x + size, y);
            ctx.arc(x, y, size, 0, Math.PI * 2);
          }
        }
        if (kind === "rain") {
          ctx.strokeStyle = style.color;
          ctx.lineWidth = style.width;
          ctx.lineCap = "round";
          ctx.stroke();
        } else {
          ctx.fillStyle = style.color;
          ctx.fill();
        }
      }
    };

    const tick = (dt: number) => {
      if (!field) return;
      time += dt;
      const goal = desired();
      active = {
        far: approach(active.far, goal.far, dt, RETARGET_TAU_S),
        near: approach(active.near, goal.near, dt, RETARGET_TAU_S),
      };
      slant = approach(slant, target.current.slant, dt, RETARGET_TAU_S);
      stepField(field, active, dt, slant, time);
      draw();
    };

    const visibility = documentVisibility();
    const loop = new FrameLoop(tick, visibility, animationFrames());
    const report = () => {
      canvas.dataset.running = String(loop.running);
    };

    /** Nieruchoma klatka (reduced motion): docelowa gęstość i kąt od razu. */
    const still = () => {
      active = desired();
      slant = target.current.slant;
      draw();
    };

    const syncMode = () => {
      const moving = !target.current.reduceMotion;
      loop.setEnabled(moving);
      report();
      if (!moving) still();
    };
    sync.current = syncMode;

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (field) resizeField(field, width, height);
      else {
        field = createField(kind, fieldCapacity(kind), width, height);
        // Opad od razu w pełnej gęstości: warstwa i tak wchodzi przenikaniem razem ze sceną.
        active = desired();
      }
      if (target.current.reduceMotion) still();
      else draw();
    };

    // Maska: elipsa wokół powitania. Pomiar przy zmianie układu i przewinięciu (układ kolumnowy),
    // nigdy w pętli klatek.
    const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
    let maskFrame = 0;
    const placeMask = () => {
      maskFrame = 0;
      if (!header) return;
      const rect = header.getBoundingClientRect();
      canvas.style.setProperty("--mask-x", `${rect.left + rect.width / 2}px`);
      canvas.style.setProperty("--mask-y", `${rect.top + rect.height / 2}px`);
      canvas.style.setProperty("--mask-rx", `${rect.width * 0.75}px`);
      canvas.style.setProperty("--mask-ry", `${rect.height * 0.95}px`);
    };
    const onScroll = () => {
      if (!maskFrame) maskFrame = requestAnimationFrame(placeMask);
    };

    const observer = new ResizeObserver(() => {
      resize();
      placeMask();
    });
    observer.observe(canvas);
    if (header) observer.observe(header);
    window.addEventListener("scroll", onScroll, { passive: true });
    const offVisibility = visibility.subscribe(report);

    resize();
    placeMask();
    syncMode();

    return () => {
      sync.current = null;
      loop.dispose();
      offVisibility();
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(maskFrame);
    };
  }, [kind]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="precipitation-layer"
      data-kind={kind}
      className="precip-layer pointer-events-none absolute inset-0 size-full"
    />
  );
}
