import type { SceneMedia } from "@/lib/scenes";

/**
 * Wybór formatu plików sceny w przeglądarce: AV1 tylko z wydajnym dekodowaniem,
 * postery w formacie, który przeglądarka wybrała w `<picture>` sceny.
 */

/** 1080p24, profil Main, poziom 4.0, 8 bit (`scripts/encode-scenes.sh`). */
export const AV1_TYPE = 'video/mp4; codecs="av01.0.08M.08"';
/** H.264 High, poziom 5.0 (oryginalne pętle). */
export const H264_TYPE = 'video/mp4; codecs="avc1.640032"';

/** Najwyższa przepływność pętli AV1 (sunny, ~4,8 Mb/s) z zapasem. */
const AV1_PROBE = { contentType: AV1_TYPE, width: 1920, height: 1080, bitrate: 5_000_000, framerate: 24 };

export interface DecodingVerdict {
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}

/**
 * AV1 tylko przy płynnym i energooszczędnym (w praktyce sprzętowym) dekodowaniu. Programowy dav1d
 * działa wszędzie, ale na przeciętnym laptopie kosztuje więcej CPU i baterii niż sprzętowe H.264,
 * a tło gra cały czas – mniejszy plik nie jest tego wart.
 */
export function shouldUseAv1(verdict: DecodingVerdict | null): boolean {
  return verdict !== null && verdict.supported && verdict.smooth && verdict.powerEfficient;
}

let av1Decision: Promise<boolean> | null = null;

/** Decyzja liczona raz na wizytę (wspólna dla wszystkich warstw sceny). */
export function preferAv1(): Promise<boolean> {
  av1Decision ??= (async () => {
    const probe = document.createElement("video");
    if (!probe.canPlayType(AV1_TYPE) || !("mediaCapabilities" in navigator)) return false;
    try {
      return shouldUseAv1(await navigator.mediaCapabilities.decodingInfo({ type: "file", video: AV1_PROBE }));
    } catch {
      return false;
    }
  })();
  return av1Decision;
}

export type PosterFormat = "avif" | "webp" | "jpg";

let posterFormat: PosterFormat | null = null;

/** Zapamiętuje format, który przeglądarka wybrała dla posteru sceny (`img.currentSrc`). */
export function rememberPosterFormat(currentSrc: string): void {
  const match = /\.(avif|webp|jpg)(?:$|\?)/.exec(currentSrc);
  if (match) posterFormat = match[1] as PosterFormat;
}

/**
 * Adres posteru dla `new Image()` (podgląd dnia w kuli): ten sam format co tło, więc plik
 * często jest już w pamięci podręcznej. Przed pierwszym posterem sceny – JPG (działa wszędzie).
 */
export function posterUrl(media: SceneMedia, format: PosterFormat | null = posterFormat): string {
  if (format === "avif") return media.posterAvif;
  if (format === "webp") return media.posterWebp;
  return media.poster;
}
