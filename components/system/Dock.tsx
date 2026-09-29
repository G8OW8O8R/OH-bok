"use client";

import {
  AlarmClock,
  ChartLine,
  Cloud,
  CookingPot,
  ListChecks,
  Monitor,
  Music,
  Newspaper,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Glass } from "@/components/ui/Glass";

interface DockApp {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Aplikacja już istnieje. Pozostałe są oznaczone „wkrótce” zamiast udawać, że działają. */
  ready: boolean;
}

const APPS: DockApp[] = [
  { id: "weather", label: "Pogoda", icon: Cloud, ready: true },
  { id: "shopping", label: "Lista zakupów", icon: ListChecks, ready: false },
  { id: "reminders", label: "Przypomnienia", icon: AlarmClock, ready: false },
  { id: "recipes", label: "Przepisy", icon: CookingPot, ready: false },
  { id: "news", label: "Wiadomości", icon: Newspaper, ready: false },
  { id: "markets", label: "Rynki", icon: ChartLine, ready: false },
  { id: "music", label: "Muzyka", icon: Music, ready: false },
  { id: "monitor", label: "Monitor", icon: Monitor, ready: false },
  { id: "settings", label: "Ustawienia", icon: Settings, ready: false },
];

interface DockProps {
  active: string;
  onOpen: (id: string) => void;
}

/** Dock z osobnych okrągłych przycisków; aktywny moduł ma bursztynową kropkę. */
export function Dock({ active, onOpen }: DockProps) {
  return (
    <Glass
      depth="near"
      parallax={false}
      role="navigation"
      aria-label="Aplikacje"
      data-testid="dock"
      className="desktop-dock fixed rounded-pill p-2"
    >
      <ul className="flex gap-3.25">
        {APPS.map(({ id, label, icon: Icon, ready }) => {
          const hintId = `dock-hint-${id}`;
          return (
            <li key={id} className="group relative shrink-0">
              <button
                type="button"
                aria-label={label}
                aria-disabled={!ready || undefined}
                aria-describedby={ready ? undefined : hintId}
                aria-current={id === active ? "true" : undefined}
                onClick={ready ? () => onOpen(id) : undefined}
                className="grid size-13.5 place-items-center rounded-full border border-white/8 bg-white/6 text-text-primary transition-[background-color,scale] duration-(--dur-feedback) ease-out hover:bg-white/12 active:scale-95 aria-disabled:text-text-secondary aria-disabled:active:scale-100"
              >
                <Icon aria-hidden className="size-5.5" strokeWidth={1.75} />
              </button>
              {id === active && (
                <span aria-hidden className="absolute top-0.5 right-0.5 size-2.75 rounded-full bg-amber" />
              )}
              <span
                id={hintId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 translate-y-1 rounded-pill bg-[rgb(14_16_20/0.82)] px-3 py-1 text-caption whitespace-nowrap text-text-primary opacity-0 transition-[opacity,translate] duration-(--dur-feedback) ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
              >
                {ready ? label : `${label} · wkrótce`}
              </span>
            </li>
          );
        })}
      </ul>
    </Glass>
  );
}
