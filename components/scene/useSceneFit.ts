"use client";

import { useCallback } from "react";
import { computeSceneFit, sceneFitCssVars } from "@/lib/scene-fit";

/**
 * Ref callback dla sceny: liczy pudełko kadru (lib/scene-fit.ts) przy każdej zmianie
 * rozmiaru okna i gęstości pikseli, a wynik zapisuje w zmiennych CSS czytanych przez
 * `.scene-media`. Bez re-renderów Reacta. Pierwsze wartości ustawia wcześniej skrypt
 * inline na początku <body> (components/system/InitScript.tsx), więc hydracja ich nie zmienia.
 */
export function useSceneFit<T extends HTMLElement>() {
  return useCallback((stage: T | null) => {
    if (!stage) return;

    const apply = () => {
      const fit = computeSceneFit(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
      for (const [name, value] of Object.entries(sceneFitCssVars(fit))) {
        stage.style.setProperty(name, value);
      }
    };

    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(stage);

    // Przeniesienie okna na ekran o innej gęstości pikseli nie musi zmienić rozmiaru w CSS.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      apply();
      watchDpr();
    };
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDprChange);
    };

    watchDpr();
    apply();

    return () => {
      resizeObserver.disconnect();
      dprQuery?.removeEventListener("change", onDprChange);
    };
  }, []);
}
