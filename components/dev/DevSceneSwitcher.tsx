import Link from "next/link";
import { WEATHER_STATES, type WeatherState } from "@/lib/scenes";

interface DevSceneSwitcherProps {
  current: WeatherState;
}

/** Tylko w trybie dev: szybkie przełączanie `?weather=` nawigacją po stronie klienta (z przenikaniem). */
export function DevSceneSwitcher({ current }: DevSceneSwitcherProps) {
  return (
    <nav
      aria-label="Scena (dev)"
      className="fixed right-4 bottom-4 flex gap-1 rounded-pill border border-glass-border bg-glass p-1 text-xs backdrop-blur-xl"
    >
      {WEATHER_STATES.map((state) => (
        <Link
          key={state}
          href={`?weather=${state}`}
          replace
          scroll={false}
          aria-current={state === current ? "page" : undefined}
          className="rounded-pill px-2.5 py-1 text-text-secondary transition-colors duration-(--dur-feedback) hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber aria-[current=page]:bg-white/10 aria-[current=page]:text-amber"
        >
          {state}
        </Link>
      ))}
    </nav>
  );
}
