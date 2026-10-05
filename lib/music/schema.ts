import { z } from "zod";
import { musicMoodSchema } from "./mood";

/** Utwór w kolejce (odpowiedź `/api/music`). Strumień idzie wprost z hosta Audius. */
export const trackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  /** Strona utworu na audius.co (atrybucja). */
  url: z.url(),
  /** Okładka 480×480; null = brak (kapsuła pokazuje poster sceny). */
  artwork: z.url().nullable(),
  duration: z.number().positive(),
  stream: z.url(),
});

export type Track = z.infer<typeof trackSchema>;

export const musicQueueSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), mood: musicMoodSchema, label: z.string(), tracks: z.array(trackSchema).min(1) }),
  z.object({ available: z.literal(false), mood: musicMoodSchema, label: z.string() }),
]);

export type MusicQueue = z.infer<typeof musicQueueSchema>;
