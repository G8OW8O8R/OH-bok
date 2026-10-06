import { z } from "zod";
import type { DayPeriod } from "@/lib/day-period";

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

/** Nagrane pętle wideo: kilka stanów pogody (i pór dnia) dzieli jedno nagranie. */
export type SceneVideoId = "sunny" | "cloudy" | "rain" | "night-clear" | "night-cloudy";

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

/**
 * Pliki sceny: pętla H.264 i poster JPG to oryginały; obok nich wersja AV1 i postery
 * AVIF/WebP z `scripts/encode-scenes.sh`. Postery w każdym formacie to klatka 0 nagrania.
 */
export interface SceneMedia {
  /** H.264 – zapas dla przeglądarek bez wydajnego dekodowania AV1. */
  video: string;
  videoAv1: string;
  /** JPG – zapas w `<picture>` i domyślny adres (SSR, testy). */
  poster: string;
  posterAvif: string;
  posterWebp: string;
}

function sceneMedia(folder: string): SceneMedia {
  const base = `/scenes/${folder}`;
  return {
    video: `${base}/loop-1080.mp4`,
    videoAv1: `${base}/loop-1080.av1.mp4`,
    poster: `${base}/poster.jpg`,
    posterAvif: `${base}/poster.avif`,
    posterWebp: `${base}/poster.webp`,
  };
}

export const SCENE_MEDIA: Record<SceneVideoId, SceneMedia> = {
  sunny: sceneMedia("sunny-lighthouse"),
  cloudy: sceneMedia("cloudy-lighthouse"),
  rain: sceneMedia("rain-lighthouse"),
  // Plansze nocne: lampa pulsuje w samym filmie (bez snopa w kodzie poza deszczem i burzą).
  "night-clear": sceneMedia("night-clear"),
  "night-cloudy": sceneMedia("night-cloudy"),
};

/** Filtr wideo w stałej postaci, żeby CSS mógł płynnie interpolować między scenami. */
export interface VideoFilter {
  brightness: number;
  saturate: number;
}

/** Kolor jako mnożniki kanałów (0–1 w CSS, w kuli także > 1). */
export type Rgb = readonly [number, number, number];

export const NEUTRAL_TINT: Rgb = [1, 1, 1];

/**
 * Tło szkła `rgba(r, g, b, a)` rozłożone na kolor (`--glass-rgb`) i krycie (`--glass-alpha`):
 * przy zmianie sceny przenika się samo krycie (kompozytor), kolor zmienia się od razu.
 */
export function glassFill(tint: string): { rgb: string; alpha: number } {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(tint);
  if (!match) return { rgb: "14 16 20", alpha: 0.42 };
  return { rgb: `${match[1]} ${match[2]} ${match[3]}`, alpha: match[4] === undefined ? 1 : Number(match[4]) };
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
  /**
   * Barwa całego obrazu (mnożenie, przed `videoFilter`): chłodniejsza noc na planszy
   * deszczowej. Neutralna = [1, 1, 1].
   */
  tint: Rgb;
  /**
   * Siła ciepłego gradientu złotej godziny (0–1): ciepło przy horyzoncie i nisko na niebie,
   * prawie neutralnie u góry, lekko chłodniejsze cienie (`.scene-golden`).
   */
  warmth: number;
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

/** Sceny dzienne (baza); złota godzina i noc w `resolveScene`. */
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
      tint: NEUTRAL_TINT,
      warmth: 0,
    },
    effects: { ...NO_EFFECTS, motes: true },
  },
  cloudy: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      haloStrength: 0.95,
      vignetteStrength: 1,
      videoFilter: NEUTRAL_FILTER,
      textShadow: STRONG_SHADOW,
      glassTint: BRIGHT_SKY_GLASS,
      glassBlur: 40,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
      tint: NEUTRAL_TINT,
      warmth: 0,
    },
    effects: NO_EFFECTS,
  },
  fog: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      haloStrength: 0.95,
      vignetteStrength: 1,
      videoFilter: NEUTRAL_FILTER,
      textShadow: STRONG_SHADOW,
      glassTint: BRIGHT_SKY_GLASS,
      glassBlur: 40,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
      tint: NEUTRAL_TINT,
      warmth: 0,
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
      tint: NEUTRAL_TINT,
      warmth: 0,
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
      tint: NEUTRAL_TINT,
      warmth: 0,
    },
    effects: { ...NO_EFFECTS, precipitation: "rain", beam: true },
  },
  snow: {
    video: "cloudy",
    tokens: {
      scrimStrength: 0.2,
      haloStrength: 0.95,
      vignetteStrength: 1,
      videoFilter: NEUTRAL_FILTER,
      textShadow: STRONG_SHADOW,
      glassTint: BRIGHT_SKY_GLASS,
      glassBlur: 40,
      glassTextShadow: BRIGHT_GLASS_TEXT_SHADOW,
      tint: NEUTRAL_TINT,
      warmth: 0,
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
      tint: NEUTRAL_TINT,
      warmth: 0,
    },
    effects: { ...NO_EFFECTS, precipitation: "rain", lightning: true, beam: true },
  },
};

/** Plansza nocna dla stanu: deszczowe stany zostają na planszy rain (z ciemniejszym gradingiem). */
export const NIGHT_VIDEO: Record<WeatherState, SceneVideoId> = {
  sunny: "night-clear",
  cloudy: "night-cloudy",
  fog: "night-cloudy",
  snow: "night-cloudy",
  drizzle: "rain",
  rain: "rain",
  storm: "rain",
};

/** Złota godzina: siła ciepłego gradientu; za chmurami słońce grzeje słabiej. */
const GOLDEN_WARMTH: Record<WeatherState, number> = {
  sunny: 1,
  cloudy: 0.6,
  fog: 0.5,
  snow: 0.5,
  drizzle: 0.45,
  rain: 0.4,
  storm: 0.3,
};

/** Noc na planszy deszczowej: ciemniej, mniej koloru, chłodniej. */
const NIGHT_RAIN_TINT: Rgb = [0.86, 0.92, 1];

/**
 * Plansze nocne są ciemne: biały tekst ma zapas kontrastu (≥ 7:1 przy tokenach jasnego nieba),
 * więc przyciemnienia i szkło jak przy deszczu – noc nie wygląda na przydymioną.
 */
const NIGHT_SKY: Partial<SceneTokens> = {
  scrimStrength: 0.12,
  haloStrength: 0.25,
  vignetteStrength: 0.5,
  textShadow: SOFT_SHADOW,
  glassTint: "rgba(14, 16, 20, 0.4)",
  glassBlur: 36,
  glassTextShadow: GLASS_TEXT_SHADOW,
};

/** Nadpisania tokenów złotej godziny i nocy (pomiar kontrastu, 2026-10-03). */
const PERIOD_TOKENS: Record<Exclude<DayPeriod, "day">, Record<WeatherState, Partial<SceneTokens>>> = {
  golden: {
    sunny: { warmth: GOLDEN_WARMTH.sunny },
    cloudy: { warmth: GOLDEN_WARMTH.cloudy },
    fog: { warmth: GOLDEN_WARMTH.fog },
    snow: { warmth: GOLDEN_WARMTH.snow },
    drizzle: { warmth: GOLDEN_WARMTH.drizzle },
    rain: { warmth: GOLDEN_WARMTH.rain },
    storm: { warmth: GOLDEN_WARMTH.storm },
  },
  night: {
    sunny: NIGHT_SKY,
    cloudy: NIGHT_SKY,
    fog: NIGHT_SKY,
    snow: NIGHT_SKY,
    drizzle: { videoFilter: { brightness: 0.62, saturate: 0.8 }, tint: NIGHT_RAIN_TINT },
    rain: { videoFilter: { brightness: 0.62, saturate: 0.8 }, tint: NIGHT_RAIN_TINT },
    storm: { videoFilter: { brightness: 0.5, saturate: 0.8 }, tint: NIGHT_RAIN_TINT },
  },
};

/**
 * Scena = pogoda × pora dnia. Złota godzina zostaje na planszy dziennej
 * (ciepły gradient), noc przechodzi na plansze nocne albo ciemniejszą planszę deszczu.
 * Pyłki tylko w dzień i złotą godzinę; snop tylko przy deszczu i burzy (nocne plansze
 * mają lampę w filmie).
 */
export function resolveScene(state: WeatherState, period: DayPeriod): SceneDefinition {
  return RESOLVED[period][state];
}

function buildScene(state: WeatherState, period: DayPeriod): SceneDefinition {
  const day = SCENES[state];
  if (period === "day") return day;
  return {
    video: period === "night" ? NIGHT_VIDEO[state] : day.video,
    tokens: { ...day.tokens, ...PERIOD_TOKENS[period][state] },
    effects: period === "night" ? { ...day.effects, motes: false } : day.effects,
  };
}

/** Stałe obiekty dla każdej kombinacji: te same referencje między renderami. */
const RESOLVED = Object.fromEntries(
  (["day", "golden", "night"] as const).map((period) => [
    period,
    Object.fromEntries(WEATHER_STATES.map((state) => [state, buildScene(state, period)])),
  ]),
) as Record<DayPeriod, Record<WeatherState, SceneDefinition>>;

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
