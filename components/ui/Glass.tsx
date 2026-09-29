"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { Depth } from "@/lib/parallax";
import { useParallax, usePointerLight } from "./Parallax";

interface GlassProps extends HTMLMotionProps<"div"> {
  /** Poziom głębi: cień (--depth-far/mid/near) i siła parallaxu. */
  depth: Depth;
  /** false = element stały (chrom: pigułka, dock) – tylko cień, bez ruchu za kursorem. */
  parallax?: boolean;
}

/**
 * Dymne szkło na jednym z trzech poziomów głębi. Kształt (łuk, koło, kapsuła,
 * zaokrąglony kwadrat) nadaje className; krawędź łapie refleks światła za kursorem.
 */
export function Glass({ depth, parallax = true, className, style, ...props }: GlassProps) {
  const offset = useParallax(parallax ? depth : null);
  const lightRef = usePointerLight<HTMLDivElement>();

  return (
    <motion.div
      ref={lightRef}
      data-depth={depth}
      className={`glass ${className ?? ""}`}
      style={parallax ? { ...style, x: offset.x, y: offset.y } : style}
      {...props}
    />
  );
}
