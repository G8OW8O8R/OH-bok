import { motion } from "motion/react";
import { originLayoutId } from "@/lib/windows/apps";

interface LogoProps {
  /** Otwiera okno „O systemie” (rozwija się ze znaku logo). */
  onOpen: () => void;
}

/**
 * Logo: płaski biały znak z dwóch kół (duże + małe obok) i wordmark „Obok”. Jest przyciskiem
 * okna „O systemie”; podpowiedź pod spodem przy najechaniu i fokusie.
 */
export function Logo({ onOpen }: LogoProps) {
  return (
    <div className="group relative justify-self-start">
      <button
        type="button"
        id="logo-button"
        onClick={onOpen}
        aria-label="Obok – o systemie"
        aria-haspopup="dialog"
        className="scene-text relative flex items-center gap-3 rounded-pill text-wordmark font-semibold text-text-primary transition-opacity duration-(--dur-feedback) hover:opacity-90 max-sm:gap-2 max-sm:text-[1.75rem]"
      >
        <span className="relative">
          {/* Kotwica przejścia współdzielonego: okno rośnie ze znaku logo. */}
          <motion.span aria-hidden layoutId={originLayoutId("about", "tile")} className="absolute inset-0 rounded-full" />
          <svg aria-hidden viewBox="0 0 48 32" className="relative h-12.5 w-auto max-sm:h-9 drop-shadow-[0_1px_8px_rgb(0_0_0/0.25)]">
            <circle cx="16" cy="16" r="16" fill="currentColor" />
            <circle cx="42.5" cy="16" r="5" fill="currentColor" />
          </svg>
        </span>
        Obok
      </button>
      <span
        aria-hidden
        className="logo-hint pointer-events-none absolute top-full left-0 z-10 mt-2 -translate-y-1 rounded-pill bg-[rgb(14_16_20/0.82)] px-3 py-1 text-caption whitespace-nowrap text-text-primary opacity-0 transition-[opacity,translate] duration-(--dur-feedback) ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
      >
        O systemie
      </span>
    </div>
  );
}
