"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import Image from "next/image";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { reportBootSignal } from "@/lib/boot";
import { duration, ease } from "@/lib/motion";
import { SCENE_MEDIA_SIZE } from "@/lib/scene-fit";
import { sceneFilterCss } from "@/lib/scene-grading";
import {
  initialLayers,
  markLayerReady,
  reconcileLayers,
  settleLayers,
  type SceneLayer,
  type SceneLayers,
} from "@/lib/scene-transition";
import { SCENE_MEDIA, SCENES, type SceneVideoId, type WeatherState } from "@/lib/scenes";
import { handoffStep } from "@/lib/video-handoff";
import { useSceneSource } from "./SceneSource";
import { useSceneFit } from "./useSceneFit";

/** Jeśli poster nie da znaku życia, nie blokujemy przejścia w nieskończoność. */
const READY_TIMEOUT_MS = 4000;

interface SceneVideoProps {
  weather: WeatherState;
  /** Warstwy pogody nad wideo (poza filtrem gradingu, w tym samym pudełku sceny). */
  children?: ReactNode;
}

type Crossfade = { duration: number; ease: typeof ease.dissolve };

/**
 * Pełnoekranowe tło sceny. Każda warstwa to poster (<img>, LCP) i nad nim wideo,
 * które odsłania się dopiero na klatce 0. Zmiana sceny = przenikanie warstw.
 *
 * Krycie warstw i grading to motion values ze wspólnego źródła sceny (SceneSource):
 * kula próbkuje te same klatki z tym samym postępem, więc obraz w niej zgadza się z tłem.
 */
export function SceneVideo({ weather, children }: SceneVideoProps) {
  const scene = SCENES[weather];
  const reduceMotion = useReducedMotion();
  const stageRef = useSceneFit<HTMLDivElement>();
  const { brightness, saturate, flash } = useSceneSource();
  const [layers, setLayers] = useState<SceneLayers>(() => initialLayers(scene.video));

  // Poster to LCP. Wywołane podczas SSR trafia jako <link rel="preload"> do <head>;
  // przy zmianie sceny po stronie klienta od razu zaczyna pobierać nowy poster.
  preload(SCENE_MEDIA[scene.video].poster, { as: "image", fetchPriority: "high" });

  // Dopasowanie stanu do nowej sceny w trakcie renderu (wzorzec „stan zależny od propsów”).
  const reconciled = reconcileLayers(layers, scene.video);
  if (reconciled !== layers) setLayers(reconciled);

  const crossfade = useMemo<Crossfade>(
    () => ({ duration: reduceMotion ? duration.reducedFade : duration.sceneCrossfade, ease: ease.dissolve }),
    [reduceMotion],
  );

  // Grading przechodzi razem ze sceną (dawniej CSS `transition: filter`, te same czas i krzywa).
  const target = scene.tokens.videoFilter;
  useEffect(() => {
    const controls = [
      animate(brightness, target.brightness, crossfade),
      animate(saturate, target.saturate, crossfade),
    ];
    return () => controls.forEach((control) => control.stop());
  }, [brightness, saturate, target.brightness, target.saturate, crossfade]);

  const filter = useTransform(() =>
    sceneFilterCss({ brightness: brightness.get(), saturate: saturate.get() }, flash.get()),
  );

  return (
    <div
      ref={stageRef}
      aria-hidden
      data-testid="scene"
      data-weather={weather}
      className="scene-stage fixed inset-0 -z-10 overflow-hidden bg-black"
    >
      <motion.div className="absolute inset-0" style={{ filter }}>
        {reconciled.map((layer) => (
          <SceneLayerView
            key={layer.id}
            layer={layer}
            crossfade={crossfade}
            onReady={() => setLayers((current) => markLayerReady(current, layer.id))}
            onSettled={() => setLayers((current) => settleLayers(current, layer.id))}
          />
        ))}
      </motion.div>
      {children}
    </div>
  );
}

interface SceneLayerViewProps {
  layer: SceneLayer;
  crossfade: Crossfade;
  onReady: () => void;
  /** Przenikanie zakończone: warstwa pod spodem może zniknąć. */
  onSettled: () => void;
}

function SceneLayerView({ layer, crossfade, onReady, onSettled }: SceneLayerViewProps) {
  // Pierwsza scena jest widoczna od razu (poster z SSR), kolejne wchodzą od 0.
  const opacity = useMotionValue(layer.id === 0 ? 1 : 0);
  const handleSettled = useEffectEvent(onSettled);

  useEffect(() => {
    if (!layer.ready) return;
    let active = true;
    const control = animate(opacity, 1, crossfade);
    control.then(() => {
      if (active) handleSettled();
    });
    return () => {
      active = false;
      control.stop();
    };
  }, [layer.ready, opacity, crossfade]);

  return (
    <motion.div
      className="absolute inset-0"
      data-testid="scene-layer"
      data-video={layer.video}
      data-ready={layer.ready}
      style={{ opacity }}
    >
      <SceneLayerMedia layerId={layer.id} video={layer.video} opacity={opacity} onReady={onReady} />
    </motion.div>
  );
}

interface SceneLayerMediaProps {
  layerId: number;
  video: SceneVideoId;
  opacity: MotionValue<number>;
  /** Poster jest zdekodowany: warstwa może zacząć się pojawiać. */
  onReady: () => void;
}

function SceneLayerMedia({ layerId, video, opacity, onReady }: SceneLayerMediaProps) {
  const media = SCENE_MEDIA[video];
  const { layers } = useSceneSource();
  const reduceMotion = useReducedMotion();
  const posterRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** `mediaTime` klatki, na której wideo zakryło poster (null = widać poster). */
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const handleReady = useEffectEvent(onReady);

  // Rejestracja w źródle sceny: kula próbkuje poster, a od klatki 0 wideo tej warstwy.
  useEffect(() => {
    layers.set({
      id: layerId,
      video,
      opacity,
      poster: posterRef.current,
      element: videoRef.current,
      revealed: revealedAt !== null,
    });
    // Pierwsza klatka sceny startowej wypełnia pasek postępu sekwencji (lib/boot.ts).
    if (revealedAt !== null && layerId === 0) reportBootSignal("video");
  }, [layers, layerId, video, opacity, revealedAt]);

  useEffect(() => () => layers.remove(layerId), [layers, layerId]);

  useEffect(() => {
    const poster = posterRef.current;
    if (!poster) return;
    let cancelled = false;
    poster.decode().then(
      () => {
        if (layerId === 0) reportBootSignal("poster");
        if (!cancelled) handleReady();
      },
      () => {
        // Brak posteru: przejście ruszy po timeoucie.
      },
    );
    const timeout = window.setTimeout(() => handleReady(), READY_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [media.poster, layerId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const abort = new AbortController();
    const { signal } = abort;
    let started = false;
    let rewinds = 0;
    let frameRequest = 0;

    // React nie zawsze przenosi `muted` na właściwość elementu, a bez niej
    // przeglądarki (zwłaszcza iOS Safari) blokują odtwarzanie bez gestu.
    el.muted = true;

    const play = () => {
      if (document.hidden) return;
      el.play().catch(() => {
        // Odtwarzanie jest dekoracyjne: przy odmowie (tryb oszczędzania energii,
        // przerwane ładowanie) zostaje poster, który jest pierwszą klatką.
      });
    };

    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      if (signal.aborted) return;
      if (handoffStep(frame.mediaTime, rewinds) === "rewind") {
        rewinds += 1;
        el.currentTime = 0;
        frameRequest = el.requestVideoFrameCallback(onFrame);
        return;
      }
      setRevealedAt(frame.mediaTime);
    };

    // Start dopiero z zapasem danych: przy `canplay` wideo potrafi zagrać
    // kilka klatek i stanąć na pustym buforze, co wygląda jak szarpnięcie.
    const start = () => {
      started = true;
      el.currentTime = 0;
      // Starsze przeglądarki bez requestVideoFrameCallback: odsłonięcie przy starcie odtwarzania.
      if (typeof el.requestVideoFrameCallback === "function") {
        frameRequest = el.requestVideoFrameCallback(onFrame);
      } else {
        el.addEventListener("playing", () => setRevealedAt(el.currentTime), { once: true, signal });
      }
      play();
    };

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) el.pause();
        else if (started) play();
      },
      { signal },
    );

    if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      start();
    } else {
      el.addEventListener("canplaythrough", start, { once: true, signal });
      // W HTML wideo ma preload="none", żeby nie konkurować z posterem o łącze.
      el.preload = "auto";
      if (el.readyState === HTMLMediaElement.HAVE_NOTHING) el.load();
    }

    return () => {
      abort.abort();
      if (frameRequest) el.cancelVideoFrameCallback(frameRequest);
      // StrictMode uruchamia sprzątanie bez usuwania elementu, więc zwalniamy
      // bufor tylko wtedy, gdy element naprawdę zniknął z DOM.
      queueMicrotask(() => {
        if (el.isConnected) return;
        el.pause();
        el.removeAttribute("src");
        el.load();
      });
    };
  }, [media.video]);

  return (
    <>
      <Image
        ref={posterRef}
        className="scene-media select-none"
        src={media.poster}
        alt=""
        width={SCENE_MEDIA_SIZE.width}
        height={SCENE_MEDIA_SIZE.height}
        // Poster to dokładna klatka 0: optymalizator Next przekodowałby go i zepsuł dopasowanie.
        unoptimized
        loading="eager"
        fetchPriority="high"
        draggable={false}
      />
      <motion.video
        ref={videoRef}
        className="scene-media"
        data-testid="scene-video"
        data-handoff={revealedAt === null ? "poster" : "video"}
        data-first-frame-time={revealedAt ?? undefined}
        src={media.video}
        muted
        playsInline
        loop
        preload="none"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        initial={false}
        animate={{ opacity: revealedAt === null ? 0 : 1 }}
        transition={{
          duration: reduceMotion ? duration.reducedFade : duration.posterHandoff,
          ease: ease.dissolve,
        }}
      />
    </>
  );
}
