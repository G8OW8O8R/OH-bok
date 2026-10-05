"use client";

import { glueShortWords } from "@/lib/typography";

interface GreetingProps {
  title: string;
  brief: string;
  onPlan: () => void;
}

const capsule =
  "glass rounded-pill px-5 py-2 text-body text-text-primary transition-[background-color,scale] duration-(--dur-feedback) ease-out hover:bg-white/12 active:scale-[0.97]";

/**
 * Powitanie + brief dnia + kapsuła szybkiej akcji „Plan dnia”, która prowadzi do swojego
 * celu na pulpicie (przypomnienia).
 */
export function Greeting({ title, brief, onPlan }: GreetingProps) {
  return (
    // Szerokości niezależne od treści (kolumnowo wyznacza ją `.desktop-hero-text`): brief
    // z przypomnieniem (po hydracji) nie poszerza halo ani nie przesuwa hero (CLS).
    <div data-testid="greeting" className="flex w-full flex-col items-start desk:mt-[calc(var(--u)*3.9)] desk:w-auto">
      <div className="halo scene-text w-full desk:w-[calc(var(--u)*26)]">
        <h1 data-boot-wipe="greeting" className="text-display font-semibold text-text-primary">{title}</h1>
        <p data-boot-wipe="headline" className="brief mt-2 text-lead text-text-primary">{glueShortWords(brief)}</p>
      </div>
      <div data-boot-part="actions" className="mt-6 flex flex-wrap gap-4">
        <button type="button" onClick={onPlan} className={capsule}>
          Plan dnia
        </button>
      </div>
    </div>
  );
}
