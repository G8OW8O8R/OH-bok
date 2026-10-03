"use client";

import { useSyncExternalStore } from "react";
import { getBootState, getServerBootState, subscribeBoot, type BootState } from "./boot";

/** Stan sekwencji startowej (lib/boot.ts) dla komponentów, które animują się w jej rytmie. */
export function useBootState(): BootState {
  return useSyncExternalStore(subscribeBoot, getBootState, getServerBootState);
}
