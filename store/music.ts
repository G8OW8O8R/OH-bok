"use client";

import { create } from "zustand";
import type { DayPeriod } from "@/lib/day-period";
import { bindEngine, currentTime, handleRejection, pause as pauseAudio, playSource, resume, subscribeTime } from "@/lib/music/engine";
import { MOOD_PROFILES, musicMood, type MusicMood } from "@/lib/music/mood";
import { musicQueueSchema, type Track } from "@/lib/music/schema";
import type { WeatherState } from "@/lib/scenes";

/**
 * Odtwarzacz: kolejka z `/api/music` dla nastroju z pogody i pory dnia. Kolejka ładuje się
 * od razu (kapsuła pokazuje pierwszy utwór albo „Muzyka chwilowo niedostępna”), ale dźwięk startuje
 * dopiero po kliknięciu albo komendzie ze Spotlightu – nigdy sam. Grająca kolejka nie zmienia się
 * ze zmianą pogody; nowy nastrój bierze następna kolejka.
 */

export type MusicStatus =
  /** Kolejka się ładuje. */
  | "loading"
  /** Kolejka gotowa, nic jeszcze nie gra. */
  | "ready"
  | "buffering"
  | "playing"
  | "paused"
  | "unavailable";

interface MusicState {
  status: MusicStatus;
  mood: MusicMood;
  label: string;
  tracks: Track[];
  index: number;
  /** „Coś spokojnego”: następne kolejki też spokojne. */
  calm: boolean;
  scene: { weather: WeatherState; period: DayPeriod } | null;
  /** Pogoda i pora z pulpitu (przed odtwarzaniem zmienia też kolejkę). */
  setScene: (weather: WeatherState, period: DayPeriod) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  /** „Coś spokojnego”: nowa, spokojna kolejka i od razu gra. */
  playCalm: () => void;
}

/** Tyle utworów z rzędu może nie wystartować, zanim kapsuła powie „niedostępna”. */
const MAX_FAILURES = 3;
const RETRY_MS = 5 * 60 * 1000;

let requestId = 0;
let failures = 0;
let retryTimer: number | undefined;

async function fetchQueue(mood: MusicMood) {
  try {
    const response = await fetch(`/api/music?mood=${mood}`);
    if (!response.ok) return null;
    const parsed = musicQueueSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function started(status: MusicStatus): boolean {
  return status === "playing" || status === "paused" || status === "buffering";
}

export const useMusicStore = create<MusicState>()((set, get) => {
  /** Ładuje kolejkę; `autoplay` tylko na wyraźną prośbę użytkownika (klik, komenda). */
  const load = async (mood: MusicMood, autoplay: boolean) => {
    const id = ++requestId;
    window.clearTimeout(retryTimer);
    set({ status: autoplay ? "buffering" : "loading", mood, label: MOOD_PROFILES[mood].label });
    const queue = await fetchQueue(mood);
    if (id !== requestId) return;
    if (!queue?.available) {
      set({ status: "unavailable", tracks: [], index: 0 });
      retryTimer = window.setTimeout(() => {
        if (get().status === "unavailable") void load(get().mood, false);
      }, RETRY_MS);
      return;
    }
    failures = 0;
    set({ tracks: queue.tracks, index: 0, label: queue.label, status: autoplay ? "buffering" : "ready" });
    if (autoplay) start(0);
  };

  const currentMood = (): MusicMood => {
    const { scene, calm } = get();
    return musicMood({ weather: scene?.weather ?? "cloudy", period: scene?.period ?? "day", calm });
  };

  const start = (index: number) => {
    const track = get().tracks[index];
    if (!track) return;
    set({ index, status: "buffering" });
    updateMediaSession(track);
    void playSource(track.stream).catch(handleRejection);
  };

  const advance = () => {
    const { tracks, index } = get();
    if (index + 1 < tracks.length) start(index + 1);
    else void load(currentMood(), true);
  };

  if (typeof window !== "undefined") {
    bindEngine({
      onEnded: advance,
      onError: (corsRetry) => {
        if (corsRetry) return;
        failures += 1;
        if (failures >= MAX_FAILURES) {
          pauseAudio();
          set({ status: "unavailable" });
          return;
        }
        advance();
      },
      onPlaying: () => {
        failures = 0;
        set({ status: "playing" });
        setPlaybackState("playing");
      },
      // Zmiana adresu w trakcie grania też wysyła „pause” – stan „buffering” wtedy zostaje.
      onPause: () => {
        if (get().status !== "playing") return;
        set({ status: "paused" });
        setPlaybackState("paused");
      },
      onBlocked: () => {
        set({ status: "paused" });
        setPlaybackState("paused");
      },
      onWaiting: () => set((state) => (state.status === "playing" ? { status: "buffering" } : state)),
    });
    bindMediaSession({ play: () => get().play(), pause: () => get().pause(), next: () => get().next() });
  }

  return {
    status: "loading",
    mood: "cloudy",
    label: MOOD_PROFILES.cloudy.label,
    tracks: [],
    index: 0,
    calm: false,
    scene: null,
    setScene: (weather, period) => {
      const previous = get().scene;
      if (previous?.weather === weather && previous.period === period) return;
      set({ scene: { weather, period } });
      const mood = currentMood();
      const { status, mood: loaded, tracks } = get();
      if (started(status)) return;
      if (mood !== loaded || tracks.length === 0) void load(mood, false);
    },
    play: () => {
      const { status, tracks, index } = get();
      if (status === "paused") {
        set({ status: "buffering" });
        void resume().catch(handleRejection);
      } else if (status === "ready" && tracks.length > 0) start(index);
      else if (status === "unavailable" || (status === "loading" && tracks.length === 0)) void load(currentMood(), true);
    },
    pause: () => {
      if (!started(get().status)) return;
      pauseAudio();
      set({ status: "paused" });
      setPlaybackState("paused");
    },
    toggle: () => (started(get().status) && get().status !== "paused" ? get().pause() : get().play()),
    next: () => {
      const { tracks } = get();
      if (tracks.length === 0) return;
      advance();
    },
    playCalm: () => {
      set({ calm: true });
      void load("calm", true);
    },
  };
});

/** Pozycja odtwarzania dla paska postępu (kapsuła subskrybuje `timeupdate` bez przerysowań store'u). */
export { currentTime, subscribeTime };

// --- Media Session (klawisze multimedialne, ekran blokady) -------------------------------------------

function mediaSession(): MediaSession | null {
  return typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
}

function bindMediaSession(actions: { play: () => void; pause: () => void; next: () => void }): void {
  const session = mediaSession();
  if (!session) return;
  const handlers: [MediaSessionAction, () => void][] = [
    ["play", actions.play],
    ["pause", actions.pause],
    ["nexttrack", actions.next],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Przeglądarka nie zna akcji – klawisz po prostu nie działa.
    }
  }
}

function updateMediaSession(track: Track): void {
  const session = mediaSession();
  if (!session || typeof MediaMetadata === "undefined") return;
  session.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: "Audius · Obok",
    artwork: track.artwork ? [{ src: track.artwork, sizes: "480x480", type: "image/jpeg" }] : [],
  });
}

function setPlaybackState(state: MediaSessionPlaybackState): void {
  const session = mediaSession();
  if (!session) return;
  session.playbackState = state;
  const { position, duration } = currentTime();
  if (duration > 0 && "setPositionState" in session) {
    try {
      session.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 });
    } catch {
      // Niespójna pozycja (strumień jeszcze bez długości) – pomijamy.
    }
  }
}
