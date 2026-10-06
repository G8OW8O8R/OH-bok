"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import type { Depth } from "@/lib/parallax";
import { useParallax, usePointerLight } from "./Parallax";

interface GlassProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children?: ReactNode;
  /** Poziom głębi: cień (--depth-far/mid/near) i siła parallaxu. */
  depth: Depth;
  /** false = element stały (chrom: pigułka, dock) – tylko cień, bez ruchu za kursorem. */
  parallax?: boolean;
}

/**
 * Dymne szkło na jednym z trzech poziomów głębi. Kształt (łuk, koło, kapsuła,
 * zaokrąglony kwadrat) nadaje className; krawędź łapie refleks światła za kursorem.
 */
export function Glass({ depth, parallax = true, className, style, children, ...props }: GlassProps) {
  const offset = useParallax(parallax ? depth : null);
  const lightRef = usePointerLight<HTMLSpanElement>();

  return (
    <motion.div
      data-depth={depth}
      data-parallax={parallax || undefined}
      className={`glass ${className ?? ""}`}
      style={parallax ? { ...style, x: offset.x, y: offset.y } : style}
      {...props}
    >
      {children}
      {/* Refleks na osobnym liściu: zmiana --mx/--my przelicza jeden element, nie całą treść panelu. */}
      <span ref={lightRef} aria-hidden className="glass-light" />
      {/* Koda sekwencji startowej: jeden przebieg refleksu (widoczny tylko w trakcie startu). */}
      <span aria-hidden className="glass-sweep" />
    </motion.div>
  );
}
