import type { PrecipitationKind } from "@/lib/scenes";

/**
 * Symulacja opadu (deszcz, śnieg) bez DOM: liczba cząstek z intensywności, kąt z wiatru,
 * krok ruchu. Rysuje ją components/scene/PrecipitationLayer.tsx.
 *
 * Dwie warstwy głębi: daleko = cienkie, szybkie, gęste; blisko = większe, rzadsze,
 * bardziej przezroczyste (zamiast kosztownego rozmycia).
 */

export const FAR = 0;
export const NEAR = 1;
export type DepthLayer = typeof FAR | typeof NEAR;

/** Ekran odniesienia dla gęstości (1920×1080). */
export const REFERENCE_AREA = 1920 * 1080;
const REFERENCE_HEIGHT = 1080;

export interface ParticleCounts {
  far: number;
  near: number;
}

/**
 * Liczba cząstek: logarytmicznie z mm/h (0,3 mm/h mżawki to wyraźnie mniej niż ulewa 8 mm/h,
 * ale 40 mm/h nie zamienia ekranu w szum), proporcjonalnie do powierzchni ekranu.
 */
export function particleCounts(kind: PrecipitationKind, intensityMmH: number, area: number): ParticleCounts {
  if (intensityMmH <= 0 || area <= 0) return { far: 0, near: 0 };
  const level = Math.log2(1 + intensityMmH);
  const scale = Math.min(1.6, Math.max(0.25, area / REFERENCE_AREA));
  const far = kind === "rain" ? 60 + 90 * level : 90 + 60 * level;
  const nearShare = kind === "rain" ? 0.3 : 0.35;
  return { far: Math.round(far * scale), near: Math.round(far * nearShare * scale) };
}

/**
 * Nachylenie toru (przesunięcie poziome na jednostkę spadku). Kierunek wiatru w konwencji
 * meteorologicznej (skąd wieje); kamera patrzy na północ, więc wiatr z zachodu (270°)
 * znosi opad w prawo. Śnieg jest lżejszy, więc wiatr znosi go mocniej.
 */
export function windSlant(kind: PrecipitationKind, windKmh: number, windDirectionDeg: number | null): number {
  if (windDirectionDeg === null || !Number.isFinite(windDirectionDeg) || windKmh <= 0) return 0;
  const across = -Math.sin((windDirectionDeg * Math.PI) / 180) * windKmh;
  const [perKmh, limit] = kind === "rain" ? [1 / 40, 0.45] : [1 / 20, 1.2];
  return Math.max(-limit, Math.min(limit, across * perKmh));
}

/** Najsilniejszy opad, na jaki pole ma miejsce (gęstość dalej rośnie tylko logarytmicznie). */
export const MAX_INTENSITY_MMH = 40;

/** Pojemność pola: maksimum cząstek dla największego ekranu i najsilniejszego opadu. */
export function fieldCapacity(kind: PrecipitationKind): ParticleCounts {
  return particleCounts(kind, MAX_INTENSITY_MMH, Number.POSITIVE_INFINITY);
}

/**
 * Pole cząstek o stałej pojemności: indeksy [0, farCapacity) to warstwa daleka, reszta bliska.
 * Widoczna jest tylko część (`active`), więc zmiana intensywności nie losuje pola od nowa.
 */
export interface ParticleField {
  kind: PrecipitationKind;
  count: number;
  farCapacity: number;
  x: Float32Array;
  y: Float32Array;
  /** Prędkość spadku (px/s). */
  speed: Float32Array;
  /** Długość smugi (deszcz) albo promień płatka (śnieg), px. */
  size: Float32Array;
  /** Faza kołysania płatka (śnieg). */
  phase: Float32Array;
  layer: Uint8Array;
  width: number;
  height: number;
}

interface LayerLook {
  speed: [number, number];
  size: [number, number];
}

/** Wygląd warstw przy wysokości 1080 px (skalowany do ekranu). */
const LOOK: Record<PrecipitationKind, Record<DepthLayer, LayerLook>> = {
  rain: {
    [FAR]: { speed: [950, 1250], size: [14, 22] },
    [NEAR]: { speed: [1600, 2000], size: [30, 46] },
  },
  snow: {
    [FAR]: { speed: [32, 56], size: [1, 1.8] },
    [NEAR]: { speed: [70, 110], size: [2.4, 3.6] },
  },
};

function between([min, max]: [number, number], t: number): number {
  return min + (max - min) * t;
}

function respawn(field: ParticleField, i: number, random: () => number, anywhere: boolean): void {
  const layer = field.layer[i] as DepthLayer;
  const look = LOOK[field.kind][layer];
  const unit = field.height / REFERENCE_HEIGHT;
  field.speed[i] = between(look.speed, random()) * unit;
  field.size[i] = between(look.size, random()) * (field.kind === "rain" ? unit : Math.max(1, unit));
  field.phase[i] = random() * Math.PI * 2;
  field.x[i] = random() * field.width;
  // Start: rozsiane po całym ekranie; później: nad górną krawędzią (bez „pojawiania się” w kadrze).
  field.y[i] = anywhere ? random() * field.height : -field.size[i] - random() * field.height * 0.1;
}

export function createField(
  kind: PrecipitationKind,
  capacity: ParticleCounts,
  width: number,
  height: number,
  random: () => number = Math.random,
): ParticleField {
  const count = capacity.far + capacity.near;
  const field: ParticleField = {
    kind,
    count,
    farCapacity: capacity.far,
    x: new Float32Array(count),
    y: new Float32Array(count),
    speed: new Float32Array(count),
    size: new Float32Array(count),
    phase: new Float32Array(count),
    layer: new Uint8Array(count),
    width,
    height,
  };
  for (let i = 0; i < count; i++) {
    field.layer[i] = i < capacity.far ? FAR : NEAR;
    respawn(field, i, random, true);
  }
  return field;
}

/** Amplituda kołysania płatka (px/s) i jego częstotliwość. */
const SWAY = { amplitude: 18, frequency: 0.9 } as const;

/** Zakresy indeksów widocznych cząstek w obu warstwach (przycięte do pojemności). */
export function activeRanges(field: ParticleField, active: ParticleCounts): [[number, number], [number, number]] {
  const far = Math.max(0, Math.min(field.farCapacity, Math.round(active.far)));
  const nearCapacity = field.count - field.farCapacity;
  const near = Math.max(0, Math.min(nearCapacity, Math.round(active.near)));
  return [
    [0, far],
    [field.farCapacity, field.farCapacity + near],
  ];
}

/**
 * Krok symulacji widocznych cząstek. Te, które wypadły dołem, wracają nad ekran; wyniesione
 * wiatrem w bok wracają z drugiej strony (bez pustego pasa przy krawędzi).
 */
export function stepField(
  field: ParticleField,
  active: ParticleCounts,
  dt: number,
  slant: number,
  time: number,
  random: () => number = Math.random,
): void {
  for (const [from, to] of activeRanges(field, active)) stepRange(field, from, to, dt, slant, time, random);
}

function stepRange(
  field: ParticleField,
  from: number,
  to: number,
  dt: number,
  slant: number,
  time: number,
  random: () => number,
): void {
  const { width, height } = field;
  const snow = field.kind === "snow";
  for (let i = from; i < to; i++) {
    const fall = field.speed[i]! * dt;
    let dx = fall * slant;
    if (snow) dx += Math.sin(time * SWAY.frequency * Math.PI * 2 + field.phase[i]!) * SWAY.amplitude * dt;
    field.y[i]! += fall;
    let x = field.x[i]! + dx;
    if (x < 0) x += width;
    else if (x >= width) x -= width;
    field.x[i] = x;
    if (field.y[i]! - field.size[i]! > height) respawn(field, i, random, false);
  }
}

/** Przeskalowanie pola do nowego rozmiaru ekranu bez losowania od nowa (resize okna). */
export function resizeField(field: ParticleField, width: number, height: number): void {
  if (field.width === width && field.height === height) return;
  const sx = width / field.width;
  const sy = height / field.height;
  for (let i = 0; i < field.count; i++) {
    field.x[i]! *= sx;
    field.y[i]! *= sy;
    field.speed[i]! *= sy;
    if (field.kind === "rain") field.size[i]! *= sy;
  }
  field.width = width;
  field.height = height;
}
