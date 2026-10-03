/** Logo: płaski biały znak z dwóch kół (duże + małe obok) i wordmark „Obok”. */
export function Logo() {
  return (
    <p className="scene-text flex items-center gap-3 text-wordmark font-semibold text-text-primary max-sm:gap-2 max-sm:text-[1.75rem]">
      <svg aria-hidden viewBox="0 0 48 32" className="h-12.5 w-auto max-sm:h-9 drop-shadow-[0_1px_8px_rgb(0_0_0/0.25)]">
        <circle cx="16" cy="16" r="16" fill="currentColor" />
        <circle cx="42.5" cy="16" r="5" fill="currentColor" />
      </svg>
      Obok
    </p>
  );
}
