"use client";

import { Check, Plus } from "lucide-react";
import Image from "next/image";
import { Glass } from "@/components/ui/Glass";
import type { Recipe } from "@/lib/desktop/sample";
import tomatoSoup from "@/public/recipes/tomato-soup.jpg";

interface RecipeOrbProps {
  recipe: Recipe;
  added: boolean;
  onAdd: () => void;
  called: boolean;
}

/** Przepis dnia (blisko): okrągłe zdjęcie w szklanym kole i bursztynowe „+” = składniki na listę. */
export function RecipeOrb({ recipe, added, onAdd, called }: RecipeOrbProps) {
  return (
    <Glass
      depth="near"
      role="region"
      aria-labelledby="recipe-title"
      id="recipe"
      tabIndex={-1}
      data-testid="recipe"
      data-called={called || undefined}
      className="group grid size-53.5 shrink-0 place-items-center rounded-full"
    >
      <h2 id="recipe-title" className="sr-only">
        Przepis dnia: {recipe.title}
      </h2>
      <div className="relative size-40 overflow-hidden rounded-full shadow-[0_calc(var(--u)*0.6)_calc(var(--u)*1.6)_rgb(0_0_0/0.45)]">
        {/* Miska zajmuje środek kadru: powiększenie wypełnia koło zupą, łupek zostaje na brzegu. */}
        <Image
          src={tomatoSoup}
          alt=""
          placeholder="blur"
          sizes="(min-width: 1200px) 11vw, 160px"
          className="size-full scale-[1.42] object-cover"
        />
      </div>
      <p
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 rounded-pill bg-[rgb(14_16_20/0.82)] px-3 py-1 text-caption whitespace-nowrap text-text-primary opacity-0 transition-[opacity,translate] duration-(--dur-feedback) ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
      >
        {recipe.title}
      </p>
      <button
        type="button"
        onClick={onAdd}
        disabled={added}
        aria-label={added ? "Składniki dodane do listy" : `Dodaj składniki do listy: ${recipe.ingredients.join(", ")}`}
        className="absolute top-0 right-0 grid size-13.5 place-items-center rounded-full bg-amber text-[rgb(20_14_8)] shadow-[0_calc(var(--u)*0.3)_calc(var(--u)*1)_rgb(0_0_0/0.35)] transition-[scale] duration-(--dur-feedback) ease-out hover:scale-105 active:scale-95 disabled:hover:scale-100"
      >
        {added ? (
          <Check aria-hidden className="size-6" strokeWidth={2.25} />
        ) : (
          <Plus aria-hidden className="size-6.5" strokeWidth={2.25} />
        )}
      </button>
    </Glass>
  );
}
