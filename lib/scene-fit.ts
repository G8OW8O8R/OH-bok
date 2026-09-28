/**
 * Pudełko kadru sceny: wspólna geometria posteru, wideo i przyszłych warstw
 * (deszcz, mgła, pioruny). Zamiast `object-fit: cover` każda warstwa dostaje
 * ten sam, jawnie policzony prostokąt i `object-fit: fill`. Dzięki temu żadna
 * ścieżka renderowania (obraz vs warstwa wideo kompozytora) nie skaluje ani nie
 * pozycjonuje treści po swojemu, więc przy przejściu poster → wideo nie ma
 * przesunięć o ułamki piksela.
 */

/** Natywny rozmiar nagrań i posterów sceny. */
export const SCENE_MEDIA_SIZE = { width: 1280, height: 720 } as const;

export const SCENE_ASPECT = SCENE_MEDIA_SIZE.width / SCENE_MEDIA_SIZE.height;

/** Punkt kadru, który zostaje widoczny przy przycinaniu (0–1). */
export interface SceneFocus {
  x: number;
  y: number;
}

export const SCENE_FOCUS: SceneFocus = { x: 0.5, y: 0.5 };

/** Prostokąt w pikselach CSS, wyrównany do pikseli fizycznych. */
export interface SceneFit {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Liczy pudełko pokrywające okno (odpowiednik `cover`) w pikselach fizycznych,
 * zaokrągla je do całych pikseli ekranu i zwraca w pikselach CSS.
 */
export function computeSceneFit(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  aspect: number = SCENE_ASPECT,
  focus: SceneFocus = SCENE_FOCUS,
): SceneFit {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const viewW = viewportWidth * dpr;
  const viewH = viewportHeight * dpr;

  // Szerokość w górę, wysokość do najbliższego piksela (ale nie mniej niż okno):
  // pokrycie jest zagwarantowane, a proporcje odbiegają o ≤ 0,5 px fizycznego,
  // identycznie dla wszystkich warstw.
  const boxW = Math.ceil(Math.max(viewW, viewH * aspect));
  const boxH = Math.max(Math.ceil(viewH), Math.round(boxW / aspect));

  const left = Math.round((viewW - boxW) * focus.x);
  const top = Math.round((viewH - boxH) * focus.y);

  return {
    width: boxW / dpr,
    height: boxH / dpr,
    left: left / dpr,
    top: top / dpr,
  };
}

/** Zmienne CSS czytane przez `.scene-media` (app/globals.css). */
export function sceneFitCssVars(fit: SceneFit): Record<string, string> {
  return {
    "--scene-width": `${fit.width}px`,
    "--scene-height": `${fit.height}px`,
    "--scene-left": `${fit.left}px`,
    "--scene-top": `${fit.top}px`,
    "--scene-translate": "none",
  };
}

/**
 * Skrypt inline do <head>: ustawia pudełko kadru przed pierwszym malowaniem.
 * Bez niego poster do hydracji stałby w geometrii z CSS (ułamkowej), a potem
 * przeskakiwał o ~0,2 px do wartości z JS. Kod pochodzi z `computeSceneFit`,
 * więc obie ścieżki liczą identycznie (pilnuje tego test jednostkowy).
 */
export function sceneFitInlineScript(): string {
  // Wszystkie argumenty podajemy jawnie: domyślne wartości parametrów odwołują się
  // do stałych modułu, których w skrypcie inline nie ma.
  const args = `r.clientWidth,r.clientHeight,window.devicePixelRatio||1,${SCENE_ASPECT},${JSON.stringify(SCENE_FOCUS)}`;
  return [
    "(function(){",
    "var r=document.documentElement;",
    `var f=(${computeSceneFit.toString()})(${args});`,
    "var s=document.createElement('style');",
    "s.id='scene-fit';",
    "s.textContent=':root{--scene-width:'+f.width+'px;--scene-height:'+f.height+'px;--scene-left:'+f.left+'px;--scene-top:'+f.top+'px;--scene-translate:none}';",
    "document.head.appendChild(s);",
    "})();",
  ].join("");
}
