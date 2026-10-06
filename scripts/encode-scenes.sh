#!/usr/bin/env bash
# Wersje AV1 pętli scen i postery AVIF/WebP obok istniejących plików.
# Istniejące loop-1080.mp4 (H.264) i poster.jpg zostają bez zmian – skrypt tylko dopisuje pliki.
#
#   scripts/encode-scenes.sh            # wszystkie sceny, pomija pliki, które już istnieją
#   FORCE=1 scripts/encode-scenes.sh    # koduje od nowa
#   FORCE_POSTERS=1 scripts/encode-scenes.sh  # tylko postery od nowa
#   FFMPEG=/ścieżka/ffmpeg scripts/encode-scenes.sh
#
# Wymaga ffmpeg z libsvtav1 (wideo), libaom-av1 (AVIF) i libwebp (np. 8.x „full build”).
set -euo pipefail

FFMPEG="${FFMPEG:-ffmpeg}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCENES="$ROOT/public/scenes"

for encoder in libsvtav1 libaom-av1 libwebp; do
  if ! "$FFMPEG" -hide_banner -encoders 2>/dev/null | grep -q " $encoder "; then
    echo "Brak enkodera $encoder w '$FFMPEG'. Ustaw FFMPEG na ffmpeg z pełnym zestawem kodeków." >&2
    exit 1
  fi
done

# Oznaczenie barw jak przy odtwarzaniu H.264 (pliki źródłowe nie mają znaczników, przeglądarki
# przyjmują wtedy BT.709 w zakresie TV). Jawne znaczniki = te same kolory w każdej przeglądarce.
COLOR=(-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv)

for dir in "$SCENES"/*/; do
  src="$dir/loop-1080.mp4"
  [ -f "$src" ] || continue
  name="$(basename "$dir")"

  av1="$dir/loop-1080.av1.mp4"
  if [ -n "${FORCE:-}" ] || [ ! -f "$av1" ]; then
    echo "→ $name: AV1"
    # Te same klatki (bez zmiany liczby i tempa), klatka kluczowa co 2 s, bez dźwięku, moov na początku.
    # 8 bit 4:2:0 jak źródło: dekodowanie sprzętowe i programowe (dav1d) bez dodatkowego kosztu.
    "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -map 0:v:0 -an \
      -c:v libsvtav1 -preset 4 -crf 34 -g 48 -pix_fmt yuv420p \
      -svtav1-params "tune=0:enable-overlays=1:scd=0" \
      "${COLOR[@]}" -fps_mode passthrough -movflags +faststart "$av1"
  fi

  # Postery z klatki 0 nagrania (poster.jpg też jest klatką 0). Klatka przechodzi przez RGB tak, jak
  # przeglądarka pokazuje wideo (BT.709, zakres TV), i trafia do AVIF jako 4:4:4 w pełnym zakresie
  # z jawnym BT.709/sRGB. Bezpośrednie YUV 4:2:0 z wideo dawało w przeglądarkach przesunięcie
  # niebieskiego o ok. 3 poziomy (pomiar 2026-10-06: zrzut posteru vs zrzut klatki 0).
  avif="$dir/poster.avif"
  if [ -n "${FORCE:-}${FORCE_POSTERS:-}" ] || [ ! -f "$avif" ]; then
    echo "→ $name: poster AVIF"
    "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -frames:v 1       -vf "scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt709:out_range=pc,format=yuv444p"       -c:v libaom-av1 -still-picture 1 -crf 22 -cpu-used 4       -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 -color_range pc -f avif "$avif"
  fi

  webp="$dir/poster.webp"
  if [ -n "${FORCE:-}${FORCE_POSTERS:-}" ] || [ ! -f "$webp" ]; then
    echo "→ $name: poster WebP"
    "$FFMPEG" -hide_banner -loglevel error -y -i "$src" -frames:v 1 \
      -vf "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgra" \
      -c:v libwebp -quality 88 -compression_level 6 "$webp"
  fi
done

echo
echo "Rozmiary:"
for dir in "$SCENES"/*/; do
  for f in loop-1080.mp4 loop-1080.av1.mp4 poster.jpg poster.avif poster.webp; do
    [ -f "$dir/$f" ] && printf '%8s KB  %s/%s\n' "$(( $(wc -c < "$dir/$f") / 1024 ))" "$(basename "$dir")" "$f"
  done
done
