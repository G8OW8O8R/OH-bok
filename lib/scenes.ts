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

/** Nazwy stanów w UI (po polsku). */
export const WEATHER_LABELS: Record<WeatherState, string> = {
  sunny: "Słonecznie",
  cloudy: "Pochmurno",
  fog: "Mgła",
  drizzle: "Mżawka",
  rain: "Deszcz",
  snow: "Śnieg",
  storm: "Burza",
};

/** Etykieta z uwzględnieniem pory dnia: „słonecznie” w nocy brzmi źle. */
export function weatherLabel(state: WeatherState, isDay: boolean): string {
  if (state === "sunny" && !isDay) return "Bezchmurnie";
  return WEATHER_LABELS[state];
}

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

/** Filtr wideo w stałej postaci, żeby CSS mógł płynnie interpolować między scenami. */
export interface VideoFilter {
  brightness: number;
  saturate: number;
}

export interface SceneTokens {
  /** Siła winiety pod tekstem po lewej (0–1). */
  scrimStrength: number;
  /**
   * Siła miękkiej, eliptycznej winiety za swobodnym tekstem (powitanie, zegar).
   * Liniowy scrim wygasa przed środkiem kadru, a powitanie stoi na niebie.
   */
  haloStrength: number;
  /**
   * Winieta górnej krawędzi i prawego górnego narożnika (logo, pigułka, zegar):
   * jak winietowanie obiektywu, bez paska u góry. 0–1.
   */
  vignetteStrength: number;
  videoFilter: VideoFilter;
  textShadow: string;
  glassTint: string;
  /** Rozmycie tła szkła (px, maks. 40). */
  glassBlur: number;
  /** Cień tekstu wewnątrz paneli szkła: dociąga kontrast w jasnych scenach bez ciężkiego tintu. */
  glassTextShadow: string;
}

/** Opad rysowany w kodzie (components/scene/PrecipitationLayer.tsx). */
export type PrecipitationKind = "rain" | "snow";

/**
 * Warstwy pogody nad wideo (tabela stanów). Siłę opadu wyznacza osobno
 * intensywność w mm/h (lib/scene-conditions.ts), tu tylko co jest widoczne.
 */
export interface SceneEffects {
  precipitation: PrecipitationKind | null;
  lightning: boolean;
  fog: boolean;
  /** Snop latarni (tylko deszcz i burza). */
  beam: boolean;
  /** Pyłki w słońcu. */
  motes: boolean;
}

export interface SceneDefinition {
  video: SceneVideoId;
  tokens: SceneTokens;
  effects: SceneEffects;
}

const NO_EFFECTS: SceneEffects = { precipitation: null, lightning: false, fog: false, beam: false, motes: false };

const NEUTRAL_FILTER: VideoFilter = { brightness: 1, saturate: 1 };
const SOFT_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.25), 0 2px 16px rgba(0, 0, 0, 0.2)";
/** Jasne niebo: wąski cień przy literach + szeroki, miękki pod całym tekstem (zamiast widocznej plamy). */
const STRONG_SHADOW =
  "0 1px 2px rgba(0, 0, 0, 0.45), 0 0 18px rgba(0, 0, 0, 0.4), 0 2px 44px rgba(0, 0, 0, 0.35)";
/** Jasne niebo (pochmurno, mgła, śnieg): lżejszy tint niż wcześniej (.62) przy blur 40 px, kontrast dociąga cień tekstu. */
const BRIGHT_SKY_GLASS = "rgba(14, 16, 20, 0.58)";
const GLASS_TEXT_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.3)";
const BRIGHT_GLASS_TEXT_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.5), 0 0 14px rgba(0, 0, 0, 0.45)";

export const SCENES: Record<WeatherState, SceneDefinition> = {
  sunny: {
    video: "sunny",
    tokens: {
      scrimStrength: 0.32,
      haloStrength: 0.55,
      vignetteStrength: 0.8,
      videoFilter: { brightness: 1, saturate: 0.9 },
      textShadow: STRONG_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.46)",
      glassBlur: 38,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
    },
    effects: { ...NO_EFFECTS, motes: true },
  },
  cloudy: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      haloStrength: 0.8,
      vignetteStrength: 1,
      videoFilter: NEUTRAL_FILTER,
      textShadow: STRONG_SHADOW,
      glassTint: BRIGHT_SKY_GLASS,
      glassBlur: 40,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
    },
    effects: NO_EFFECTS,
  },
  fog: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      haloStrength: 0.8,
      vignetteStrength: 1,
      videoFilter: NEUTRAL_FILTER,
      textShadow: STRONG_SHADOW,
      glassTint: BRIGHT_SKY_GLASS,
      glassBlur: 40,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
    },
    effects: { ...NO_EFFECTS, fog: true },
  },
  drizzle: {
    video: "rain",
    tokens: {
      scrimStrength: 0.15,
      haloStrength: 0.3,
      vignetteStrength: 0.5,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.4)",
      glassBlur: 36,
      glassTextShadow: GLASS_TEXT_SHADOW,
    },
    effects: { ...NO_EFFECTS, precipitation: "rain" },
  },
  rain: {
    video: "rain",
    tokens: {
      scrimStrength: 0.15,
      haloStrength: 0.3,
      vignetteStrength: 0.5,
      videoFilter: NEUTRAL_FILTER,
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(14, 16, 20, 0.4)",
      glassBlur: 36,
      glassTextShadow: GLASS_TEXT_SHADOW,
    },
    effects: { ...NO_EFFECTS, precipitation: "rain", beam: true },
  },
  snow: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      haloStrength: 0.8,
      vignetteStrength: 1,
      videoFilter: NEUTRAL_FILTER,
      textShadow: STRONG_SHADOW,
      glassTint: BRIGHT_SKY_GLASS,
      glassBlur: 40,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
    },
    effects: { ...NO_EFFECTS, precipitation: "snow" },
  },
  storm: {
    video: "rain",
    tokens: {
      scrimStrength: 0.1,
      haloStrength: 0.15,
      vignetteStrength: 0.3,
      videoFilter: { brightness: 0.72, saturate: 0.9 },
      textShadow: SOFT_SHADOW,
      glassTint: "rgba(12, 14, 18, 0.44)",
      glassBlur: 36,
      glassTextShadow: GLASS_TEXT_SHADOW,
    },
    effects: { ...NO_EFFECTS, precipitation: "rain", lightning: true, beam: true },
  },
};

export function toCssFilter({ brightness, saturate }: VideoFilter): string {
  return `brightness(${brightness}) saturate(${saturate})`;
}

/** Kod pogody WMO (Open-Meteo) → stan sceny, według tabeli stanów pogody. */
export function wmoToWeather(code: number): WeatherState {
  // Kody WMO są całkowite; wszystko inne traktujemy jak nieznany kod.
  if (!Number.isInteger(code)) return "cloudy";
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
