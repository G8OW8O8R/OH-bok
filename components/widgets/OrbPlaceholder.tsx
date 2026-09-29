/**
 * Kula „Obok” – statyczny placeholder (refrakcja, stany i podgląd przyszłości to osobne zadanie).
 * Duża szklana kula z bursztynowym rim light i mała kula przy jej prawym dolnym brzegu.
 */
export function OrbPlaceholder() {
  return (
    <div aria-hidden data-testid="orb" className="relative size-(--orb-size) shrink-0">
      <div className="orb size-full" />
      <div className="orb orb-small absolute right-[-2%] bottom-[2%] size-[21%]" />
    </div>
  );
}
