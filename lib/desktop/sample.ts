/**
 * Dane przykładowe pulpitu: przepis i utwór (do podmiany na prawdziwe źródła).
 * Lista zakupów i przypomnienia mają własne store'y (store/shopping.ts, store/reminders.ts).
 */

export interface Recipe {
  id: string;
  title: string;
  ingredients: string[];
}

export interface Track {
  title: string;
}

export const SAMPLE_RECIPE: Recipe = {
  id: "zupa-pomidorowa",
  title: "Zupa pomidorowa",
  ingredients: ["Pomidory", "Śmietana", "Bazylia"],
};

export const SAMPLE_TRACK: Track = { title: "Deszcz nad morzem" };
