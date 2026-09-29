import Link from "next/link";
import { WEATHER_STATES, type WeatherState } from "@/lib/scenes";

interface DevSceneSwitcherProps {
  /** Aktywny override albo null = prawdziwa pogoda. */
  current: WeatherState | null;
}

const OPTIONS: ReadonlyArray<{ label: string; href: string; state: WeatherState | null }> = [
  { label: "na żywo", href: "/", state: null },
  ...WEATHER_STATES.map((state) => ({ label: state, href: `?weather=${state}`, state })),
];

/** Tylko w trybie dev: szybkie przełączanie `?weather=` nawigacją po stronie klienta (z przenikaniem). */
export function DevSceneSwitcher({ current }: DevSceneSwitcherProps) {
  return (
    <nav
      aria-label="Scena (dev)"
      className="fixed right-4 bottom-4 flex gap-1 rounded-pill border border-glass-border bg-glass p-1 text-xs backdrop-blur-xl"
    >
      {OPTIONS.map(({ label, href, state }) => (
        <Link
          key={label}
          href={href}
          replace
          scroll={false}
          aria-current={state === current ? "page" : undefined}
          className="rounded-pill px-2.5 py-1 text-text-secondary transition-colors duration-(--dur-feedback) hover:text-text-primary focus-visible:outline-2 focus-visible:outline-amber aria-[current=page]:bg-white/10 aria-[current=page]:text-amber"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
