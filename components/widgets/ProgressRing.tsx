interface ProgressRingProps {
  value: number;
  total: number;
  className?: string;
}

const R = 42;
const C = 2 * Math.PI * R;

/** Pierścień postępu w bursztynie z licznikiem „3/4” w środku (mikrowizualizacja). */
export function ProgressRing({ value, total, className }: ProgressRingProps) {
  const progress = total > 0 ? value / total : 0;
  return (
    <div className={`relative grid shrink-0 place-items-center ${className ?? ""}`}>
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--accent-amber)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <p className="text-ring font-medium text-text-primary tabular-nums">
        <span aria-hidden>
          {value}/{total}
        </span>
        <span className="sr-only">
          Kupione {value} z {total}
        </span>
      </p>
    </div>
  );
}
