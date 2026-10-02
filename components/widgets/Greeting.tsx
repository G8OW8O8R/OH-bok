"use client";

import { glueShortWords } from "@/lib/typography";

interface GreetingProps {
  title: string;
  brief: string;
  recipeLabel: string;
  onPlan: () => void;
  onRecipe: () => void;
}

const capsule =
  "glass rounded-pill px-5 py-2 text-body text-text-primary transition-[background-color,scale] duration-(--dur-feedback) ease-out hover:bg-white/12 active:scale-[0.97]";

/**
 * Powitanie + brief dnia + dwie kapsuły szybkich akcji. Każda kapsuła prowadzi do swojego
 * celu na pulpicie (plan → przypomnienia, przepis → okrągły przepis).
 */
export function Greeting({ title, brief, recipeLabel, onPlan, onRecipe }: GreetingProps) {
  return (
    <div data-testid="greeting" className="flex max-w-[36rem] flex-col items-start desk:mt-[calc(var(--u)*3.9)] desk:max-w-none">
      <div className="halo scene-text desk:max-w-[calc(var(--u)*26)]">
        <h1 className="text-display font-semibold text-text-primary">{title}</h1>
        <p className="brief mt-2 text-lead text-text-primary">{glueShortWords(brief)}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-4">
        <button type="button" onClick={onPlan} className={capsule}>
          Plan dnia
        </button>
        <button type="button" onClick={onRecipe} className={capsule}>
          {recipeLabel}
        </button>
      </div>
    </div>
  );
}
