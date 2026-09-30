import { SCENE_MEDIA, SCENES, WEATHER_LABELS, type SceneVideoId, type VideoFilter } from "@/lib/scenes";
import { weekdayLong } from "@/lib/time";
import type { DailyForecast } from "@/lib/weather/schema";

/**
 * Podgląd pogody innego dnia w kuli (kryształowa kula): poster sceny tego dnia
 * z jej gradingiem, kadrowany na latarnię, oraz tekst dla czytników ekranu.
 */

export interface OrbPreviewImage {
  video: SceneVideoId;
  poster: string;
  grading: VideoFilter;
}

export function previewImage(day: Pick<DailyForecast, "state">): OrbPreviewImage {
  const scene = SCENES[day.state];
  return { video: scene.video, poster: SCENE_MEDIA[scene.video].poster, grading: scene.tokens.videoFilter };
}

/**
 * Kadr podglądu na posterze (współrzędne 0–1): środek przy latarni, `span` = połowa
 * wysokości kadru widoczna w kuli. Klatka ma 16:9, więc w poziomie kadr jest węższy.
 */
export const PREVIEW_FOCUS = { x: 0.74, y: 0.47, span: 0.36 } as const;

function temperature(value: number | null): string {
  if (value === null) return "brak danych o temperaturze";
  const rounded = Math.round(value);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/** „Czwartek: słonecznie, 18°” – odpowiednik tekstowy podglądu (canvas jest aria-hidden). */
export function previewAnnouncement(
  day: Pick<DailyForecast, "date" | "state" | "temperatureMaxC">,
  today: string,
): string {
  const name = day.date === today ? "Dziś" : weekdayLong(day.date);
  return `${name}: ${WEATHER_LABELS[day.state].toLowerCase()}, ${temperature(day.temperatureMaxC)}`;
}
