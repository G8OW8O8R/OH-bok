"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { preload } from "react-dom";
import { duration, ease } from "@/lib/motion";
import {
  initialLayers,
  markLayerReady,
  reconcileLayers,
  settleLayers,
  type SceneLayers,
} from "@/lib/scene-transition";
import {
  SCENE_FIT,
  SCENE_MEDIA,
  SCENES,
  toCssFilter,
  type SceneVideoId,
  type WeatherState,
} from "@/lib/scenes";

/** Jeśli ani poster, ani wideo nie dadzą znaku życia, nie blokujemy przejścia w nieskończoność. */
const READY_TIMEOUT_MS = 4000;

interface SceneVideoProps {
  weather: WeatherState;
}

/**
 * Pełnoekranowe tło sceny: poster (LCP) + bezszwowa pętla wideo.
 * Zmiana sceny = przenikanie między dwoma elementami <video>.
 */
export function SceneVideo({ weather }: SceneVideoProps) {
  const scene = SCENES[weather];

  // Poster to LCP. Wywołane podczas SSR trafia jako <link rel="preload"> do <head>;
  // przy zmianie sceny po stronie klienta od razu zaczyna pobierać nowy poster.
  preload(SCENE_MEDIA[scene.video].poster, { as: "image", fetchPriority: "high" });
  const reduceMotion = useReducedMotion();
  const [layers, setLayers] = useState<SceneLayers>(() => initialLayers(scene.video));

  // Dopasowanie stanu do nowej sceny w trakcie renderu (wzorzec „stan zależny od propsów”).
  const reconciled = reconcileLayers(layers, scene.video);
  if (reconciled !== layers) setLayers(reconciled);

  const fade = {
    duration: reduceMotion ? duration.reducedFade : duration.sceneCrossfade,
    ease: ease.soft,
  };

  return (
    <div
      aria-hidden
      data-testid="scene"
      data-weather={weather}
      className="fixed inset-0 -z-10 overflow-hidden bg-black"
    >
      <div
        className="absolute inset-0"
        style={{
          filter: toCssFilter(scene.tokens.videoFilter),
          transition: "filter var(--dur-scene) var(--ease-soft)",
        }}
      >
        {reconciled.map((layer) => (
          <motion.div
            key={layer.id}
            className="absolute inset-0"
            data-testid="scene-layer"
            data-video={layer.video}
            data-ready={layer.ready}
            // Pierwsza scena jest widoczna od razu (poster z SSR), kolejne wchodzą od 0.
            initial={layer.id === 0 ? false : { opacity: 0 }}
            animate={{ opacity: layer.ready ? 1 : 0 }}
            transition={fade}
            onAnimationComplete={() => {
              if (layer.ready) setLayers((current) => settleLayers(current, layer.id));
            }}
          >
            <SceneVideoElement
              video={layer.video}
              onReady={() => setLayers((current) => markLayerReady(current, layer.id))}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

interface SceneVideoElementProps {
  video: SceneVideoId;
  onReady: () => void;
}

function SceneVideoElement({ video, onReady }: SceneVideoElementProps) {
  const media = SCENE_MEDIA[video];
  const handleReady = useEffectEvent(onReady);

  // Poster to pierwsza klatka pętli: gdy jest zdekodowany, można zaczynać przenikanie,
  // nawet jeśli wideo jeszcze się buforuje.
  useEffect(() => {
    let cancelled = false;
    const poster = new Image();
    poster.src = media.poster;
    poster.decode().then(
      () => {
        if (!cancelled) handleReady();
      },
      () => {
        // Brak posteru: poczekamy na wideo albo timeout.
      },
    );
    const timeout = window.setTimeout(() => handleReady(), READY_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [media.poster]);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;

    // React nie renderuje atrybutu `muted` w HTML z serwera, a bez niego
    // przeglądarka blokuje autoplay. Ustawiamy właściwość i startujemy ręcznie.
    el.muted = true;

    const play = () => {
      if (document.hidden) return;
      el.play().catch(() => {
        // Odtwarzanie jest dekoracyjne: przy odmowie (oszczędzanie energii,
        // przerwane ładowanie) zostaje poster, który jest pierwszą klatką.
      });
    };
    const onVisibilityChange = () => (document.hidden ? el.pause() : play());

    play();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // StrictMode odpina i przypina ref bez usuwania elementu, więc zwalniamy
      // bufor tylko wtedy, gdy element naprawdę zniknął z DOM.
      queueMicrotask(() => {
        if (el.isConnected) return;
        el.pause();
        el.removeAttribute("src");
        el.load();
      });
    };
  }, []);

  return (
    <video
      ref={attachVideo}
      className="absolute inset-0 h-full w-full"
      style={SCENE_FIT}
      src={media.video}
      poster={media.poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      onLoadedData={onReady}
      onError={onReady}
    />
  );
}
