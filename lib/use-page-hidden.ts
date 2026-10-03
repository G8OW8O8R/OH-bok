"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void): () => void {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/** true przy ukrytej karcie (warstwy CSS pauzują animacje). Na serwerze: widoczna. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.hidden,
    () => false,
  );
}
