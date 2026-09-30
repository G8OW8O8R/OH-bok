"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { usePointerUnits, useParallax } from "@/components/ui/Parallax";
import { useSceneSource, type SceneLayerHandle } from "@/components/scene/SceneSource";
import { onBootDone } from "@/lib/boot";
import type { FallbackReason } from "@/lib/orb/capability";
import { FpsWatchdog } from "@/lib/orb/fps-watchdog";
import {
  backingSize,
  breathScale,
  layoutOrigin,
  orbCircles,
  screenOrigin,
  SMALL_BREATH_PHASE_S,
  type Point,
} from "@/lib/orb/geometry";
import type { OrbPreviewImage } from "@/lib/orb/preview";
import {
  approach,
  ORB_TAU_S,
  orbTargets,
  SMALL_PULSE_SCALE,
  speakPulse,
  type OrbState,
} from "@/lib/orb/states";
import { computeSceneFit, type SceneFit } from "@/lib/scene-fit";
import { flashBrightness } from "@/lib/scene-grading";
import type { VideoFilter } from "@/lib/scenes";
import { OrbRenderer, type TextureSlot, type TextureSource } from "./renderer";

interface OrbCanvasProps {
  state: OrbState;
  preview: OrbPreviewImage | null;
  reduceMotion: boolean;
  /** `?orb-mode=webgl`: bez heurystyk, watchdoga i wymogu sprzętowego GPU. */
  forced: boolean;
  /** Płótno pokazuje już scenę (można schować kulę CSS). */
  visible: boolean;
  onReady: () => void;
  onFail: (reason: FallbackReason) => void;
}

/** Bez requestVideoFrameCallback: klatka wideo do tekstury najwyżej ok. 30 razy na sekundę. */
const UPLOAD_INTERVAL_MS = 1000 / 30;
/** Pozycja kuli bywa przesuwana przez layout (czcionki, treść nad nią): tani pomiar co sekundę. */
const REMEASURE_MS = 1000;

type SceneSlot = Extract<TextureSlot, "scene0" | "scene1">;
type PreviewIndex = 0 | 1;

interface PreviewSlot {
  poster: string | null;
  grading: VideoFilter;
  target: VideoFilter;
}

const NEUTRAL: VideoFilter = { brightness: 1, saturate: 1 };

/** Źródło do próbkowania: od klatki 0 wideo, wcześniej poster (to ta sama klatka). */
function layerSource(layer: SceneLayerHandle): TextureSource | null {
  const video = layer.element;
  if (layer.revealed && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return video;
  const poster = layer.poster;
  if (poster?.complete && poster.naturalWidth > 0) return poster;
  return null;
}

/**
 * Płótno WebGL2 kuli i jego pętla klatek. Rysuje tylko, gdy coś się zmienia (przy
 * reduced motion) albo w rytmie ekranu (oddech, fale); staje poza ekranem i przy ukrytej karcie.
 */
export function OrbCanvas({ state, preview, reduceMotion, forced, visible, onReady, onFail }: OrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source = useSceneSource();
  const parallax = useParallax("near");
  const pointer = usePointerUnits();
  const live = useRef({ state, preview, reduceMotion });
  const handleReady = useEffectEvent(onReady);
  const handleFail = useEffectEvent(onFail);

  useEffect(() => {
    live.current = { state, preview, reduceMotion };
  }, [state, preview, reduceMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = OrbRenderer.create(canvas, { allowSoftware: forced });
    if (!renderer) {
      handleFail("no-webgl2");
      return;
    }

    let raf = 0;
    let running = false;
    let stopped = false;
    let onScreen = false;
    let lastFrameAt = 0;
    let time = 0;
    let readySent = false;

    // Geometria (pomiar poza pętlą; w pętli tylko parallax i przewinięcie).
    let origin: Point = { x: 0, y: 0 };
    let size = 0;
    let scale = 1;
    let fit: SceneFit = computeSceneFit(1, 1, 1);
    let measuredAt = 0;

    // Warstwy sceny → sloty tekstur.
    const layerSlots = new Map<number, SceneSlot>();
    const slotContent: Record<SceneSlot, TextureSource | null> = { scene0: null, scene1: null };
    let layersVersion = -1;
    const hasFrameCallback = typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    const freshFrames = new Set<HTMLVideoElement>();
    const frameCallbacks = new Map<HTMLVideoElement, number>();
    const lastUpload = new Map<HTMLVideoElement, number>();

    // Podgląd dnia: dwa sloty, żeby przejść z jednego dnia na drugi bez mignięcia.
    const previewSlots: [PreviewSlot, PreviewSlot] = [
      { poster: null, grading: NEUTRAL, target: NEUTRAL },
      { poster: null, grading: NEUTRAL, target: NEUTRAL },
    ];
    let activePreview: PreviewIndex = 0;
    let loadingPoster: string | null = null;

    const fx = { think: 0, speak: 0, previewMix: 0, previewBlend: 0 };
    let lastSignature = "";

    const watchdog = new FpsWatchdog();
    let watching = false;

    const measure = (now: number) => {
      measuredAt = now;
      const rect = canvas.getBoundingClientRect();
      origin = layoutOrigin(rect, { x: window.scrollX, y: window.scrollY }, { x: parallax.x.get(), y: parallax.y.get() });
      size = canvas.clientWidth;
      const backing = backingSize(size, window.devicePixelRatio);
      scale = size > 0 ? backing / size : 1;
      renderer.resize(backing, backing);
      const root = document.documentElement;
      fit = computeSceneFit(root.clientWidth, root.clientHeight, window.devicePixelRatio);
    };

    const watchVideo = (video: HTMLVideoElement) => {
      if (!hasFrameCallback || frameCallbacks.has(video)) return;
      const onVideoFrame = () => {
        freshFrames.add(video);
        frameCallbacks.set(video, video.requestVideoFrameCallback(onVideoFrame));
      };
      frameCallbacks.set(video, video.requestVideoFrameCallback(onVideoFrame));
    };

    const unwatchVideo = (video: HTMLVideoElement) => {
      const handle = frameCallbacks.get(video);
      if (handle !== undefined) video.cancelVideoFrameCallback(handle);
      frameCallbacks.delete(video);
      freshFrames.delete(video);
      lastUpload.delete(video);
    };

    const syncLayers = (layers: readonly SceneLayerHandle[]) => {
      const ids = new Set(layers.map((layer) => layer.id));
      for (const id of layerSlots.keys()) if (!ids.has(id)) layerSlots.delete(id);
      for (const layer of layers) {
        if (layerSlots.has(layer.id)) continue;
        const taken = new Set(layerSlots.values());
        const slot: SceneSlot = taken.has("scene0") ? "scene1" : "scene0";
        layerSlots.set(layer.id, slot);
        slotContent[slot] = null;
      }
      const videos = new Set(layers.flatMap((layer) => (layer.element ? [layer.element] : [])));
      for (const video of videos) watchVideo(video);
      for (const video of [...frameCallbacks.keys()]) if (!videos.has(video)) unwatchVideo(video);
    };

    /** Przesyła nowe klatki warstw; zwraca true, gdy coś się zmieniło. */
    const uploadScene = (layers: readonly SceneLayerHandle[], now: number): boolean => {
      let changed = false;
      for (const layer of layers) {
        const slot = layerSlots.get(layer.id);
        const media = slot ? layerSource(layer) : null;
        if (!slot || !media) continue;
        let due = slotContent[slot] !== media;
        if (!due && media instanceof HTMLVideoElement) {
          due = hasFrameCallback
            ? freshFrames.has(media)
            : !media.paused && now - (lastUpload.get(media) ?? 0) >= UPLOAD_INTERVAL_MS;
        }
        if (!due) continue;
        if (renderer.upload(slot, media)) {
          slotContent[slot] = media;
          changed = true;
          if (media instanceof HTMLVideoElement) {
            freshFrames.delete(media);
            lastUpload.set(media, now);
          }
        }
      }
      return changed;
    };

    const loadPreview = (image: OrbPreviewImage) => {
      loadingPoster = image.poster;
      const img = new Image();
      img.decoding = "async";
      img.src = image.poster;
      img.decode().then(
        () => {
          if (stopped || loadingPoster !== image.poster) return;
          loadingPoster = null;
          // Nic nie widać: od razu do aktywnego slotu. W trakcie podglądu: do drugiego i przenikanie.
          const target: PreviewIndex = fx.previewMix > 0 ? (activePreview === 0 ? 1 : 0) : activePreview;
          if (!renderer.upload(target === 0 ? "preview0" : "preview1", img)) return;
          previewSlots[target] = { poster: image.poster, grading: image.grading, target: image.grading };
          activePreview = target;
          if (fx.previewMix === 0) fx.previewBlend = target;
        },
        () => {
          // Brak posteru: podgląd się nie pokaże, kula zostaje przy scenie.
          if (loadingPoster === image.poster) loadingPoster = null;
        },
      );
    };

    const stepPreview = (image: OrbPreviewImage | null, dt: number, tau: number): boolean => {
      const active = previewSlots[activePreview];
      if (image) {
        if (active.poster === image.poster) active.target = image.grading;
        else if (loadingPoster !== image.poster) loadPreview(image);
      }
      const showing = image !== null && active.poster !== null;
      fx.previewMix = approach(fx.previewMix, showing ? 1 : 0, dt, tau);
      fx.previewBlend = approach(fx.previewBlend, activePreview, dt, tau);
      for (const slot of previewSlots) {
        slot.grading = {
          brightness: approach(slot.grading.brightness, slot.target.brightness, dt, tau),
          saturate: approach(slot.grading.saturate, slot.target.saturate, dt, tau),
        };
      }
      return fx.previewMix > 0;
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      watchdog.pause();
      canvas.dataset.running = "false";
    };

    const fail = (reason: FallbackReason) => {
      stop();
      stopped = true;
      handleFail(reason);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.1) : 0;
      lastFrameAt = now;
      const { state, preview, reduceMotion } = live.current;
      if (!reduceMotion) time += dt;

      if (watching && !reduceMotion) {
        const verdict = watchdog.frame(now);
        if (verdict === "slow") return fail("slow");
        if (verdict === "ok") watching = false;
      }

      if (now - measuredAt > REMEASURE_MS) measure(now);

      const layers = source.layers.list().slice(-2);
      if (source.layers.version !== layersVersion) {
        layersVersion = source.layers.version;
        syncLayers(layers);
      }
      const uploaded = uploadScene(layers, now);
      const [base, incoming] = layers;
      const baseSlot = base ? layerSlots.get(base.id) : undefined;
      if (!baseSlot || !slotContent[baseSlot]) return;
      const incomingSlot = incoming ? layerSlots.get(incoming.id) : undefined;
      const hasIncoming = incomingSlot !== undefined && slotContent[incomingSlot] !== null;

      const tau = reduceMotion ? ORB_TAU_S.reduced : ORB_TAU_S.state;
      const targets = orbTargets(state);
      fx.think = approach(fx.think, targets.think, dt, tau);
      fx.speak = approach(fx.speak, targets.speak, dt, tau);
      stepPreview(preview, dt, reduceMotion ? ORB_TAU_S.reduced : ORB_TAU_S.preview);

      const pulse = speakPulse(time, reduceMotion);
      const breath = reduceMotion
        ? { big: 1, small: 1 }
        : { big: breathScale(time), small: breathScale(time, SMALL_BREATH_PHASE_S) };
      const circles = orbCircles(size, breath, reduceMotion ? 0 : SMALL_PULSE_SCALE * fx.speak * pulse);
      const screen = screenOrigin(origin, { x: window.scrollX, y: window.scrollY }, { x: parallax.x.get(), y: parallax.y.get() });
      const cursor = { x: pointer.x.get(), y: pointer.y.get() };
      const sceneMix = hasIncoming && incoming ? incoming.opacity.get() : 0;
      const flash = source.flash.get();
      const glow = fx.speak * (reduceMotion ? pulse : 0.55 + 0.45 * pulse);

      // Przy reduced motion rysujemy tylko wtedy, gdy zmieniło się cokolwiek widocznego.
      const signature = [
        screen.x, screen.y, cursor.x, cursor.y, sceneMix, flash, fx.think, fx.speak,
        fx.previewMix, fx.previewBlend, source.brightness.get(), source.saturate.get(), size, scale,
        fit.left, fit.top, fit.width, fit.height,
      ].join();
      if (reduceMotion && !uploaded && signature === lastSignature) return;
      lastSignature = signature;

      renderer.draw({
        canvas: size,
        scale,
        origin: screen,
        fit,
        big: circles.big,
        small: circles.small,
        cursor,
        time,
        think: fx.think,
        speak: glow,
        flash,
        scene: [baseSlot, hasIncoming && incomingSlot ? incomingSlot : null],
        sceneMix,
        brightness: flashBrightness(source.brightness.get(), flash),
        saturate: source.saturate.get(),
        previewMix: fx.previewMix,
        previewBlend: fx.previewBlend,
        previewGrading: [previewSlots[0].grading, previewSlots[1].grading],
      });

      if (!readySent) {
        readySent = true;
        handleReady();
      }
    };

    const start = () => {
      if (running || stopped) return;
      running = true;
      lastFrameAt = 0;
      lastSignature = "";
      canvas.dataset.running = "true";
      raf = requestAnimationFrame(frame);
    };

    const update = () => {
      if (onScreen && !document.hidden) start();
      else stop();
    };

    const intersection = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      update();
    });
    intersection.observe(canvas);

    const resize = new ResizeObserver(() => measure(performance.now()));
    resize.observe(canvas);
    resize.observe(document.documentElement);

    const onLost = (event: Event) => {
      event.preventDefault();
      fail("context-lost");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    document.addEventListener("visibilitychange", update);
    const offBoot = onBootDone(() => {
      watching = !forced;
    });

    measure(performance.now());
    canvas.dataset.running = "false";

    return () => {
      stop();
      stopped = true;
      offBoot();
      intersection.disconnect();
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", update);
      for (const video of [...frameCallbacks.keys()]) unwatchVideo(video);
      renderer.dispose();
    };
  }, [forced, source, parallax.x, parallax.y, pointer.x, pointer.y]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="orb-canvas"
      className="orb-canvas absolute"
      style={{ opacity: visible ? 1 : 0 }}
    />
  );
}
