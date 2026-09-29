"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type MotionValue,
} from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { spring } from "@/lib/motion";
import { parallaxOffset, pointerToUnit, type Depth } from "@/lib/parallax";

interface ParallaxContextValue {
  /** Pozycja kursora względem środka ekranu, [-1, 1], wygładzona sprężyną. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Rejestruje element szkła, któremu provider ustawia --mx/--my (refleks na krawędzi). */
  registerLight: (element: HTMLElement) => () => void;
}

const ParallaxContext = createContext<ParallaxContextValue | null>(null);

const FINE_POINTER = "(pointer: fine)";

function subscribeFinePointer(onChange: () => void): () => void {
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Parallax tylko z myszą/touchpadem: na dotyku nie ma kursora, za którym można podążać. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
}

/**
 * Jeden nasłuch kursora dla całego pulpitu: parallax obiektów i refleks
 * światła na krawędziach szkła. Wyłączony przy prefers-reduced-motion i bez precyzyjnego wskaźnika.
 */
export function ParallaxProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const finePointer = useFinePointer();
  const enabled = finePointer && !reduceMotion;

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, spring.gentle);
  const y = useSpring(rawY, spring.gentle);
  const lights = useRef(new Set<HTMLElement>());

  const registerLight = useCallback((element: HTMLElement) => {
    lights.current.add(element);
    return () => {
      lights.current.delete(element);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      rawX.set(0);
      rawY.set(0);
      root.style.removeProperty("--edge-light");
      return;
    }

    let frame = 0;
    let pointer = { x: 0, y: 0 };

    const paint = () => {
      frame = 0;
      rawX.set(pointerToUnit(pointer.x, window.innerWidth));
      rawY.set(pointerToUnit(pointer.y, window.innerHeight));
      for (const element of lights.current) {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--mx", `${Math.round(pointer.x - rect.left)}px`);
        element.style.setProperty("--my", `${Math.round(pointer.y - rect.top)}px`);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      pointer = { x: event.clientX, y: event.clientY };
      root.style.setProperty("--edge-light", "1");
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      rawX.set(0);
      rawY.set(0);
      root.style.setProperty("--edge-light", "0");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.style.removeProperty("--edge-light");
    };
  }, [enabled, rawX, rawY]);

  const value = useMemo(() => ({ x, y, registerLight }), [x, y, registerLight]);
  return <ParallaxContext value={value}>{children}</ParallaxContext>;
}

function useParallaxContext(): ParallaxContextValue {
  const context = useContext(ParallaxContext);
  if (!context) throw new Error("Parallax: brak <ParallaxProvider> wyżej w drzewie.");
  return context;
}

/** Przesunięcie (px) dla poziomu głębi; null = obiekt stały (chrom: logo, pigułka, dock). */
export function useParallax(depth: Depth | null): { x: MotionValue<number>; y: MotionValue<number> } {
  const { x, y } = useParallaxContext();
  const offsetX = useTransform(x, (unit) => (depth ? parallaxOffset(unit, depth) : 0));
  const offsetY = useTransform(y, (unit) => (depth ? parallaxOffset(unit, depth) : 0));
  return { x: offsetX, y: offsetY };
}

/** Rejestracja elementu na refleks światła za kursorem. */
export function usePointerLight<T extends HTMLElement>(): RefObject<T | null> {
  const { registerLight } = useParallaxContext();
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    return element ? registerLight(element) : undefined;
  }, [registerLight]);
  return ref;
}

interface DepthLayerProps extends HTMLMotionProps<"div"> {
  depth: Depth;
}

/** Warstwa głębi bez szkła (np. powitanie, kula): tylko parallax. */
export function DepthLayer({ depth, style, ...props }: DepthLayerProps) {
  const { x, y } = useParallax(depth);
  return <motion.div data-depth={depth} style={{ ...style, x, y }} {...props} />;
}
