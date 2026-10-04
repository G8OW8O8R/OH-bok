"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Rozmiar elementu w pikselach (ResizeObserver), mierzony przed pierwszym malowaniem.
 * Wykresy rysują SVG w pikselach kontenera: bez skalowania `pathLength` i grubość linii są dokładne.
 */
export function useElementSize<T extends HTMLElement>(fallback: ElementSize) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const width = Math.round(element.clientWidth);
      const height = Math.round(element.clientHeight);
      if (width > 0 && height > 0) setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
