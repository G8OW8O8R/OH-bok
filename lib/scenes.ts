import { z } from "zod";

/** Stany pogody rozróżniane przez UI. */
export const WEATHER_STATES = [
  "sunny",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "storm",
] as const;

export const weatherStateSchema = z.enum(WEATHER_STATES);
export type WeatherState = z.infer<typeof weatherStateSchema>;

/** Nagrane pętle wideo: kilka stanów pogody dzieli jedno nagranie. */
export type SceneVideoId = "sunny" | "cloudy" | "rain";

export const DEFAULT_WEATHER: WeatherState = "rain";

export interface SceneMedia {
  video: string;
  poster: string;
}

export const SCENE_MEDIA: Record<SceneVideoId, SceneMedia> = {
  sunny: {
    video: "/scenes/sunny-lighthouse/loop-720.mp4",
    poster: "/scenes/sunny-lighthouse/poster.jpg",
  },
  cloudy: {
    video: "/scenes/cloudy-lighthouse/loop-720.mp4",
    poster: "/scenes/cloudy-lighthouse/poster.jpg",
  },
  rain: {
    video: "/scenes/rain-lighthouse/loop-720.mp4",
    poster: "/scenes/rain-lighthouse/poster.jpg",
  },
};

/**
 * Wspólna geometria kadru. Warstwy deszczu, mgły i piorunów MUSZĄ używać
 * tych samych wartości co <video>, inaczej rozjadą się na innych proporcjach.
 */
export const SCENE_FIT = {
  objectFit: "cover",
  objectPosition: "50% 50%",
} as const;

/** Filtr wideo w stałej postaci, żeby CSS mógł płynnie interpolować między scenami. */
export interface VideoFilter {
  brightness: number;
  saturate: number;
}

export interface SceneTokens {
  /** Siła winiety pod tekstem po lewej (0–1). */
  scrimStrength: number;
  videoFilter: VideoFilter;
  textShadow: string;
  glassTint: string;
}

export interface SceneDefinition {
  video: SceneVideoId;
  tokens: SceneTokens;
}

const NEUTRAL_FILTER: VideoFilter = { brightness: 1, saturate: 1 };
const SOFT_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.25), 0 2px 16px rgba(0, 0, 0, 0.2)";
const STRONG_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.35), 0 2px 20px rgba(0, 0, 0, 0.3)";

export const SCENES: Record<WeatherState, SceneDefinition> = {
  sunny: {
    video: "sunny",
    tokens: {
      scrimStrength: 0.32,
      videoFilter: { brightness: 1, saturate: 0.9 },
      textShadow: STRONG_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.46)",
    },
  },
  cloudy: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.42)",
    },
  },
  fog: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.42)",
    },
  },
  drizzle: {
    video: "rain",
    tokens: {
      scrimStrength: 0.15,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.4)",
    },
  },
  rain: {
    video: "rain",
    tokens: {
      scrimStrength: 0.15,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.4)",
    },
  },
  snow: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.42)",
    },
  },
  storm: {
    video: "rain",
    tokens: {
      scrimStrength: 0.1,
      videoFilter: { brightness: 0.72, saturate: 0.9 },
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(12, 14, 18, 0.44)",
    },
  },
};

export function toCssFilter({ brightness, saturate }: VideoFilter): string {
  return `brightness(${brightness}) saturate(${saturate})`;
}

/** Kod pogody WMO (Open-Meteo) → stan sceny, według tabeli stanów pogody. */
export function wmoToWeather(code: number): WeatherState {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  // Nieznany kod: neutralna scena zamiast błędu.
  return "cloudy";
}

/** Dev override `?weather=`. Nieprawidłowa wartość = brak override'u. */
export function parseWeatherOverride(
  value: string | string[] | undefined,
): WeatherState | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = weatherStateSchema.safeParse(raw?.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}
