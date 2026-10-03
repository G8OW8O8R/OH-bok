/**
 * Snop latarni (tylko deszcz i burza): stożek światła zakotwiczony w lampie (pozycja
 * w pudełku kadru sceny), obracany wokół osi wieży animacją CSS – `scaleX` daje skrót
 * perspektywiczny, gdy snop skręca w stronę widza, wtedy rozbłyskuje lampa. Tylko
 * `transform` i `opacity` (kompozytor); rozmycie stożka rasteryzowane raz.
 */
export function BeamLayer() {
  return (
    <div aria-hidden data-testid="beam-layer" className="beam-layer scene-media">
      <div className="beam-sweep">
        <div className="beam-cone">
          <div className="beam-shape" />
        </div>
      </div>
      <div className="beam-glow" />
    </div>
  );
}
