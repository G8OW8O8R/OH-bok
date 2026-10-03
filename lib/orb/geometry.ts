import type { SceneFit } from "@/lib/scene-fit";

/**
 * Geometria kuli: gdzie na ekranie stoi płótno (z parallaxem), gdzie w nim są obie kule
 * i jak piksel ekranu przekłada się na współrzędne klatki sceny. Shader liczy tak samo.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Margines płótna wokół kuli (ułamek średnicy na stronę): oddech, rim i mała kula. */
export const ORB_CANVAS_PAD = 0.06;

/**
 * Mała kula w jednostkach średnicy dużej (lewy górny róg dużej = 0,0), jak w makiecie:
 * 21% średnicy, przy prawym dolnym brzegu.
 */
export const SMALL_ORB = { x: 0.915, y: 0.875, r: 0.105 } as const;

/** Płótno nie potrzebuje więcej niż 2× (kula jest miękka, a koszt rośnie z kwadratem). */
export const MAX_ORB_DPR = 2;

/** Oddychanie: skala ±1,5%, okres 6 s. */
export const BREATH_AMPLITUDE = 0.015;
export const BREATH_PERIOD_S = 6;
/** Mała kula oddycha z przesunięciem fazy, jak wcześniej w CSS. */
export const SMALL_BREATH_PHASE_S = 2.2;

/**
 * Pozycja płótna w układzie dokumentu bez parallaxu. Mierzymy `getBoundingClientRect`
 * (który zawiera bieżące przesunięcie warstwy głębi), więc odejmujemy parallax z chwili pomiaru.
 */
export function layoutOrigin(measured: Rect, scroll: Point, parallaxAtMeasure: Point): Point {
  return {
    x: measured.left + scroll.x - parallaxAtMeasure.x,
    y: measured.top + scroll.y - parallaxAtMeasure.y,
  };
}

/** Bieżąca pozycja płótna na ekranie: pozycja z layoutu, przewinięcie i aktualny parallax. */
export function screenOrigin(origin: Point, scroll: Point, parallax: Point): Point {
  return {
    x: origin.x - scroll.x + parallax.x,
    y: origin.y - scroll.y + parallax.y,
  };
}

/** Punkt ekranu (px CSS) → współrzędne klatki sceny (0–1), przez to samo pudełko co wideo. */
export function screenToSceneUv(point: Point, fit: SceneFit): Point {
  return {
    x: (point.x - fit.left) / fit.width,
    y: (point.y - fit.top) / fit.height,
  };
}

/** Skala oddechu: 1 w spoczynku, 1 + amplituda w połowie okresu (jak keyframes 50%). */
export function breathScale(timeS: number, phaseS = 0): number {
  const phase = ((timeS + phaseS) / BREATH_PERIOD_S) * Math.PI * 2;
  return 1 + (BREATH_AMPLITUDE / 2) * (1 - Math.cos(phase));
}

/** Rozmiar płótna (px CSS) dla średnicy kuli. */
export function canvasSize(orbDiameter: number): number {
  return orbDiameter * (1 + 2 * ORB_CANVAS_PAD);
}

/** Średnica kuli z rozmiaru płótna (odwrotność `canvasSize`). */
export function orbDiameter(canvasCssSize: number): number {
  return canvasCssSize / (1 + 2 * ORB_CANVAS_PAD);
}

/**
 * Mały ekran (telefon, okno < 768 px szer.): płótno maks. 1,5× gęstości i maks. 480 px bufora.
 * Kula jest tam mała i miękka, a GPU i bateria słabsze; różnicy przy 3× ekranie nie widać.
 */
export const SMALL_SCREEN = { maxWidth: 768, maxDpr: 1.5, maxBacking: 480 } as const;

/** Bufor płótna w pikselach urządzenia; `viewportWidth` (px CSS) włącza limity małego ekranu. */
export function backingSize(cssSize: number, devicePixelRatio: number, viewportWidth = Number.POSITIVE_INFINITY): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const small = viewportWidth < SMALL_SCREEN.maxWidth;
  const backing = Math.round(cssSize * Math.min(dpr, small ? SMALL_SCREEN.maxDpr : MAX_ORB_DPR));
  return Math.max(1, small ? Math.min(backing, SMALL_SCREEN.maxBacking) : backing);
}

/**
 * Obie kule we współrzędnych płótna (px CSS). Oddech zmienia promień wokół środka,
 * więc środki stoją w miejscu; puls („mówi”) powiększa tylko małą kulę.
 */
export function orbCircles(
  canvasCssSize: number,
  breath: { big: number; small: number },
  smallPulse = 0,
): { big: Circle; small: Circle } {
  const d = orbDiameter(canvasCssSize);
  const pad = ORB_CANVAS_PAD * d;
  return {
    big: { x: pad + d / 2, y: pad + d / 2, r: (d / 2) * breath.big },
    small: {
      x: pad + SMALL_ORB.x * d,
      y: pad + SMALL_ORB.y * d,
      r: SMALL_ORB.r * d * breath.small * (1 + smallPulse),
    },
  };
}
