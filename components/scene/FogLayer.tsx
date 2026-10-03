/**
 * Mgła: dwie warstwy szumu (SVG feTurbulence jako obraz tła, rasteryzowany raz)
 * dryfujące animacją `transform` na kompozytorze, bez JS w pętli. Stoi w pudełku kadru
 * sceny, więc gęstnieje przy horyzoncie niezależnie od proporcji ekranu.
 */
export function FogLayer() {
  return (
    <div aria-hidden data-testid="fog-layer" className="fog-layer scene-media">
      <div className="fog-drift fog-drift-far" />
      <div className="fog-drift fog-drift-near" />
    </div>
  );
}
