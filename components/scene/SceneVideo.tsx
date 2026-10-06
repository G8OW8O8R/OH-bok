"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { reportBootSignal } from "@/lib/boot";
import { duration, ease } from "@/lib/motion";
import { AV1_TYPE, H264_TYPE, preferAv1, rememberPosterFormat } from "@/lib/scene-media";
import { SCENE_MEDIA_SIZE } from "@/lib/scene-fit";
import type { DayPeriod } from "@/lib/day-period";
import { sceneFilterCss, tintCss } from "@/lib/scene-grading";
import {
  initialLayers,
  markLayerReady,
  reconcileLayers,
  settleLayers,
  type SceneLayer,
  type SceneLayers,
} from "@/lib/scene-transition";
import { SCENE_MEDIA, type SceneDefinition, type SceneVideoId, type WeatherState } from "@/lib/scenes";
import { handoffStep } from "@/lib/video-handoff";
import { ScenePicture } from "./ScenePicture";
import { useSceneSource } from "./SceneSource";
import { useSceneFit } from "./useSceneFit";

/** Jeśli poster nie da znaku życia, nie blokujemy przejścia w nieskończoność. */
const READY_TIMEOUT_MS = 4000;

interface SceneVideoProps {
  weather: WeatherState;
  period: DayPeriod;
  /** Najbliższa zmiana pory z zegara (ISO) – diagnostyka i testy e2e; null przy override i podróży w czasie. */
  periodEnds: string | null;
  /** Scena pogoda × pora (`resolveScene`). */
  scene: SceneDefinition;
  /** Czas przenikania w sekundach (`sceneDuration`): 1,4 s, 15 s przy zmianie pory, ≤ 150 ms przy reduced motion. */
  transitionS: number;
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
export function SceneVideo({ weather, period, periodEnds, scene, transitionS, children }: SceneVideoProps) {
  const stageRef = useSceneFit<HTMLDivElement>();
  const { brightness, saturate, tintR, tintG, tintB, warmth, flash } = useSceneSource();
  const [layers, setLayers] = useState<SceneLayers>(() => initialLayers(scene.video));

  // Poster to LCP. Wywołane podczas SSR trafia jako <link rel="preload"> do <head>;
  // przy zmianie sceny po stronie klienta od razu zaczyna pobierać nowy poster.
  // AVIF z `type`: przeglądarka bez AVIF pomija preload i bierze WebP/JPG z <picture>.
  preload(SCENE_MEDIA[scene.video].posterAvif, { as: "image", type: "image/avif", fetchPriority: "high" });

  // Dopasowanie stanu do nowej sceny w trakcie renderu (wzorzec „stan zależny od propsów”).
  const reconciled = reconcileLayers(layers, scene.video);
  if (reconciled !== layers) setLayers(reconciled);

  const crossfade = useMemo<Crossfade>(() => ({ duration: transitionS, ease: ease.dissolve }), [transitionS]);

  // Grading przechodzi razem ze sceną (te same czas i krzywa co przenikanie warstw).
  // Szybka zmiana w trakcie wolnego przejścia pory podejmuje animację od bieżącej wartości.
  const { videoFilter: target, tint, warmth: targetWarmth } = scene.tokens;
  useEffect(() => {
    const controls = [
      animate(brightness, target.brightness, crossfade),
      animate(saturate, target.saturate, crossfade),
      animate(tintR, tint[0], crossfade),
      animate(tintG, tint[1], crossfade),
      animate(tintB, tint[2], crossfade),
      animate(warmth, targetWarmth, crossfade),
    ];
    return () => controls.forEach((control) => control.stop());
  }, [brightness, saturate, tintR, tintG, tintB, warmth, target.brightness, target.saturate, tint, targetWarmth, crossfade]);

  const filter = useTransform(() =>
    sceneFilterCss({ brightness: brightness.get(), saturate: saturate.get() }, flash.get()),
  );
  const tintColor = useTransform(() => tintCss([tintR.get(), tintG.get(), tintB.get()]));
  // Neutralna barwa: warstwa mnożenia znika (krycie 0 = przeglądarka jej nie komponuje).
  const tintOpacity = useTransform(() => (tintR.get() < 0.999 || tintG.get() < 0.999 || tintB.get() < 0.999 ? 1 : 0));

  return (
    <div
      ref={stageRef}
      aria-hidden
      data-testid="scene"
      data-weather={weather}
      data-period={period}
      data-period-ends={periodEnds ?? undefined}
      data-video={scene.video}
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
        {/*
          Barwa i złota godzina leżą pod filtrem gradingu (tint → brightness → saturate, jak w kuli).
          Każda warstwa mieszania ma własne krycie: krycie na wspólnym opakowaniu izolowałoby
          mieszanie od obrazu pod spodem.
        */}
        <motion.div
          data-testid="scene-tint"
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{ backgroundColor: tintColor, opacity: tintOpacity }}
        />
        <motion.div className="scene-golden scene-golden-warm scene-media pointer-events-none" style={{ opacity: warmth }} />
        <motion.div className="scene-golden scene-golden-cool scene-media pointer-events-none" style={{ opacity: warmth }} />
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
  /** Źródła wideo: do decyzji o AV1 oba (SSR, hydracja), potem tylko wybrane – i dopiero wtedy wczytanie. */
  const [codec, setCodec] = useState<"pending" | "av1" | "h264">("pending");
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
        rememberPosterFormat(poster.currentSrc);
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
    let active = true;
    preferAv1().then((av1) => {
      if (active) setCodec(av1 ? "av1" : "h264");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || codec === "pending") return;

    const abort = new AbortController();
    const { signal } = abort;
    let started = false;
    let rewinds = 0;
    let frameRequest = 0;

    // React nie zawsze przenosi `muted` na właściwość elementu, a bez niej
    // przeglądarki (zwłaszcza iOS Safari) blokują odtwarzanie bez gestu.
    el.muted = true;

    // WebKit wczytuje metadane mimo `preload="none"`: źródło wybrane jeszcze w HTML (AV1) zostałoby
    // po usunięciu jego <source>. Inne źródło niż na liście = wybór od nowa.
    const listed = [...el.querySelectorAll("source")].some((source) => source.src === el.currentSrc);
    if (el.currentSrc && !listed) el.load();

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
      // W HTML wideo ma preload="none", żeby nie konkurować z posterem o łącze. Najpierw `load()`:
      // wybiera źródło od nowa, z listy po decyzji o AV1 (samo `preload` zacząłby pobierać źródło
      // wybrane jeszcze w HTML, czyli AV1 także tam, gdzie zostaje H.264).
      if (el.readyState === HTMLMediaElement.HAVE_NOTHING) el.load();
      el.preload = "auto";
    }

    return () => {
      abort.abort();
      if (frameRequest) el.cancelVideoFrameCallback(frameRequest);
      // StrictMode uruchamia sprzątanie bez usuwania elementu, więc zwalniamy
      // bufor tylko wtedy, gdy element naprawdę zniknął z DOM.
      queueMicrotask(() => {
        if (el.isConnected) return;
        el.pause();
        el.replaceChildren();
        el.load();
      });
    };
  }, [media.video, codec]);

  return (
    <>
      <ScenePicture
        ref={posterRef}
        media={media}
        className="scene-media select-none"
        width={SCENE_MEDIA_SIZE.width}
        height={SCENE_MEDIA_SIZE.height}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        draggable={false}
      />
      <motion.video
        ref={videoRef}
        className="scene-media"
        data-testid="scene-video"
        data-handoff={revealedAt === null ? "poster" : "video"}
        data-first-frame-time={revealedAt ?? undefined}
        data-codec={codec}
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
      >
        {/* AV1 pierwsze (~40% rozmiaru H.264), tylko przy sprzętowym dekodowaniu (`preferAv1`). */}
        {codec !== "h264" && <source src={media.videoAv1} type={AV1_TYPE} />}
        <source src={media.video} type={H264_TYPE} />
      </motion.video>
    </>
  );
}
