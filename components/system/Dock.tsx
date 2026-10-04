"use client";

import { AlarmClock, ChartCandlestick, Cloud, ListChecks, Search, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { Glass } from "@/components/ui/Glass";
import { APP_IDS, APPS, originLayoutId, type AppId } from "@/lib/windows/apps";
import { topWindow } from "@/lib/windows/stack";
import { useWindows } from "./Windows";

/** Ikony aplikacji (dock, wyniki Spotlightu). */
export const APP_ICONS: Record<AppId, LucideIcon> = {
  weather: Cloud,
  shopping: ListChecks,
  reminders: AlarmClock,
  markets: ChartCandlestick,
};

/** Tylko aplikacje, które istnieją (bez „wkrótce” i martwych przycisków). */
const DOCK: { id: AppId; icon: LucideIcon }[] = APP_IDS.map((id) => ({ id, icon: APP_ICONS[id] }));

const BUTTON =
  "relative grid size-13.5 place-items-center rounded-full border border-white/8 bg-white/6 text-text-primary transition-[background-color,scale] duration-(--dur-feedback) ease-out hover:bg-white/12 active:scale-95";

const HINT =
  "dock-hint pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 translate-y-1 rounded-pill bg-[rgb(14_16_20/0.82)] px-3 py-1 text-caption whitespace-nowrap text-text-primary opacity-0 transition-[opacity,translate] duration-(--dur-feedback) ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100";

interface DockProps {
  /** Otwiera Spotlight (na telefonie jedyna droga – nie ma Ctrl+K). */
  onSearch: () => void;
  searchOpen: boolean;
}

/**
 * Dock z osobnych okrągłych przycisków: otwiera okno aplikacji, które rozwija się z ikony;
 * aktywne okno (na wierzchu) ma bursztynową kropkę. Na desktopie dock zostaje nad tłem okien.
 * Pierwszy przycisk, oddzielony cienką kreską, otwiera Spotlight.
 */
export function Dock({ onSearch, searchOpen }: DockProps) {
  const { stack, open } = useWindows();
  const active = topWindow(stack);

  return (
    <Glass
      depth="near"
      parallax={false}
      role="navigation"
      aria-label="Aplikacje"
      data-testid="dock"
      className="desktop-dock fixed rounded-pill p-2"
    >
      <ul className="dock-row flex items-center gap-3.25">
        <li className="group relative shrink-0">
          <button
            type="button"
            id="dock-search"
            aria-label="Szukaj i polecenia (Ctrl+K)"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            onClick={onSearch}
            data-testid="dock-search"
            className={BUTTON}
          >
            <Search aria-hidden className="relative size-5.5" strokeWidth={1.75} />
          </button>
          <span aria-hidden className={HINT}>
            Szukaj · Ctrl K
          </span>
        </li>
        <li aria-hidden className="dock-separator h-7 w-px shrink-0 bg-white/16" />
        {DOCK.map(({ id, icon: Icon }) => {
          const label = APPS[id].title;
          return (
            <li key={id} className="group relative shrink-0">
              <button
                type="button"
                id={`dock-${id}`}
                aria-label={label}
                aria-haspopup="dialog"
                aria-expanded={stack.includes(id)}
                aria-current={id === active ? "true" : undefined}
                onClick={() => open(id, "dock")}
                className={BUTTON}
              >
                {/* Kotwica przejścia współdzielonego: okno rozwija się z ikony i do niej wraca. */}
                <motion.span aria-hidden layoutId={originLayoutId(id, "dock")} className="absolute inset-0 rounded-full" />
                <Icon aria-hidden className="relative size-5.5" strokeWidth={1.75} />
              </button>
              {id === active && <span aria-hidden className="absolute top-0.5 right-0.5 size-2.75 rounded-full bg-amber" />}
              <span aria-hidden className={HINT}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </Glass>
  );
}
