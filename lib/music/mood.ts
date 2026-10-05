import { z } from "zod";
import type { DayPeriod } from "@/lib/day-period";
import type { WeatherState } from "@/lib/scenes";

/**
 * Nastrój muzyki: z pogody i pory dnia, bez sieci i bez stanu. Każdy nastrój to
 * zestaw fraz wyszukiwania w Audius (gatunki), więc kolejka „brzmi jak za oknem”.
 * `calm` = prośba „coś spokojnego” – ma pierwszeństwo przed pogodą.
 */

export const MUSIC_MOODS = ["calm", "night", "rain", "snow", "golden", "sunny", "cloudy"] as const;
export const musicMoodSchema = z.enum(MUSIC_MOODS);
export type MusicMood = z.infer<typeof musicMoodSchema>;

export interface MoodProfile {
  mood: MusicMood;
  /** Krótki podpis w kapsule, gdy nic jeszcze nie gra. */
  label: string;
  /** Frazy wyszukiwania w Audius (od najbardziej pasującej). */
  queries: readonly string[];
}

export const MOOD_PROFILES: Record<MusicMood, MoodProfile> = {
  calm: { mood: "calm", label: "Coś spokojnego", queries: ["ambient", "piano", "lofi"] },
  night: { mood: "night", label: "Nocny ambient", queries: ["ambient", "lofi", "sleep"] },
  rain: { mood: "rain", label: "Lo-fi na deszcz", queries: ["lofi", "ambient", "rain"] },
  snow: { mood: "snow", label: "Zimowy ambient", queries: ["ambient", "piano", "winter"] },
  golden: { mood: "golden", label: "Złota godzina", queries: ["chill", "acoustic", "jazz"] },
  sunny: { mood: "sunny", label: "Słoneczny chill", queries: ["chill", "acoustic", "indie"] },
  cloudy: { mood: "cloudy", label: "Pochmurny chill", queries: ["chill", "lofi", "acoustic"] },
};

export interface MoodInput {
  weather: WeatherState;
  period: DayPeriod;
  /** „Coś spokojnego” ze Spotlightu. */
  calm?: boolean;
}

/** Nastrój: prośba o spokój → noc → opad/mgła → złota godzina → dzień według nieba. */
export function musicMood({ weather, period, calm = false }: MoodInput): MusicMood {
  if (calm) return "calm";
  if (period === "night") return "night";
  switch (weather) {
    case "rain":
    case "drizzle":
    case "storm":
      return "rain";
    case "snow":
    case "fog":
      return "snow";
    case "sunny":
      return period === "golden" ? "golden" : "sunny";
    case "cloudy":
      return period === "golden" ? "golden" : "cloudy";
  }
}

/** Długość utworu w kolejce: 2–8 min (bez miniatur i wielogodzinnych miksów). */
export const MIN_TRACK_S = 2 * 60;
export const MAX_TRACK_S = 8 * 60;
export const QUEUE_LENGTH = 10;
