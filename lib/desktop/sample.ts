/**
 * Dane przykładowe pulpitu: utwór (do podmiany na prawdziwe źródło).
 * Lista zakupów i przypomnienia mają własne store'y (store/shopping.ts, store/reminders.ts).
 */

export interface Track {
  title: string;
}

export const SAMPLE_TRACK: Track = { title: "Deszcz nad morzem" };
