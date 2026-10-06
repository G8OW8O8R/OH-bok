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
import { isBootDone, onBootDone } from "@/lib/boot";
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

/** Jak długo pozycje paneli dla refleksu są ważne (ms). */
const RECT_TTL_MS = 300;

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

const serverBootDone = () => false;

/** Do końca startu parallax stoi: cel przelotu kul z logo nie może uciekać za kursorem. */
function useBootDone(): boolean {
  return useSyncExternalStore(onBootDone, isBootDone, serverBootDone);
}

/**
 * Jeden nasłuch kursora dla całego pulpitu: parallax obiektów i refleks
 * światła na krawędziach szkła. Wyłączony przy prefers-reduced-motion i bez precyzyjnego wskaźnika.
 */
export function ParallaxProvider({ children, paused = false }: { children: ReactNode; paused?: boolean }) {
  const reduceMotion = useReducedMotion();
  const finePointer = useFinePointer();
  const bootDone = useBootDone();
  // `paused`: Spotlight – kula stoi w miejscu docelowym przelotu, pulpit pod tłem się nie rusza.
  const enabled = finePointer && !reduceMotion && bootDone && !paused;

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
    let lit: boolean | null = null;
    // Pozycje paneli z pamięci: odczyt w każdej klatce, po zapisach parallaxu, wymuszał przeliczenie
    // stylów (pomiar 2026-10-06: 0,7 s na 6 s ruchu przy CPU 4×). Parallax przesuwa panel o maks. 16 px,
    // czego na refleksie o promieniu 14u nie widać, więc wystarczy pomiar co RECT_TTL_MS i po zmianie układu.
    let rects = new Map<HTMLElement, DOMRect>();
    let measuredAt = -Infinity;
    const invalidate = () => {
      measuredAt = -Infinity;
    };

    const setLit = (value: boolean) => {
      if (lit === value) return;
      lit = value;
      root.style.setProperty("--edge-light", value ? "1" : "0");
    };

    const paint = (now: number) => {
      frame = 0;
      // Najpierw wszystkie odczyty, potem zapisy: przeplatanie wymuszało przeliczenie
      // stylów po każdym elemencie (dziesiątki razy na klatkę przy ruchu kursora).
      const elements = [...lights.current];
      if (now - measuredAt > RECT_TTL_MS || elements.some((element) => !rects.has(element))) {
        rects = new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
        measuredAt = now;
      }
      rawX.set(pointerToUnit(pointer.x, window.innerWidth));
      rawY.set(pointerToUnit(pointer.y, window.innerHeight));
      for (const element of elements) {
        const rect = rects.get(element);
        if (!rect) continue;
        element.style.setProperty("--mx", `${Math.round(pointer.x - rect.left)}px`);
        element.style.setProperty("--my", `${Math.round(pointer.y - rect.top)}px`);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      pointer = { x: event.clientX, y: event.clientY };
      setLit(true);
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      rawX.set(0);
      rawY.set(0);
      setLit(false);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
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

/** Wygładzona pozycja kursora względem środka ekranu, [-1, 1] (0 bez myszy i przy reduced motion). */
export function usePointerUnits(): { x: MotionValue<number>; y: MotionValue<number> } {
  const { x, y } = useParallaxContext();
  return { x, y };
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
  return <motion.div data-depth={depth} data-parallax style={{ ...style, x, y }} {...props} />;
}
