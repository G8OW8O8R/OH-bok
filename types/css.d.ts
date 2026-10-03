import "react";

declare module "react" {
  interface CSSProperties {
    /** Siła winiety sceny (components/scene/Scrim.tsx). */
    "--scrim-strength"?: number;
    /** Siła winiety górnej krawędzi i narożnika (components/scene/Scrim.tsx). */
    "--vignette-strength"?: number;
    /** Siła winiety za swobodnym tekstem (styles/desktop.css `.halo`). */
    "--halo-strength"?: number;
    /** Tło szkła zależne od sceny (`glassTint`). */
    "--glass-bg"?: string;
    /** Rozmycie szkła zależne od sceny (`glassBlur`). */
    "--glass-blur"?: string;
    /** Cień tekstu w panelach szkła (`glassTextShadow`). */
    "--glass-text-shadow"?: string;
    /** Cień swobodnego tekstu zależny od sceny (`textShadow`). */
    "--scene-text-shadow"?: string;
    /** Czas przenikania sceny; nadpisywany przy wolnym przejściu pory dnia (styles/tokens.css). */
    "--dur-scene"?: string;
    /** Kolejność elementu w sekwencji startowej (styles/boot.css). */
    "--i"?: number;
    /** Przesunięcie fazy animacji (fala dźwięku). */
    "--delay"?: string;
  }
}
