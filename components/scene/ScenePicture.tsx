import type { ComponentProps } from "react";
import type { SceneMedia } from "@/lib/scenes";

interface ScenePictureProps extends Omit<ComponentProps<"img">, "src" | "srcSet" | "alt"> {
  media: SceneMedia;
}

/**
 * Poster sceny jako `<picture>`: AVIF, WebP, a w zapasie oryginalny JPG. Bez optymalizatora
 * Next (`next/image` przekodowałby klatkę 0 i zepsuł dopasowanie do wideo) – pliki są przygotowane
 * wcześniej przez `scripts/encode-scenes.sh`. Zawsze dekoracyjny (`alt=""`).
 */
export function ScenePicture({ media, ...img }: ScenePictureProps) {
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={media.posterAvif} />
      <source type="image/webp" srcSet={media.posterWebp} />
      <img src={media.poster} alt="" {...img} />
    </picture>
  );
}
