import "react";

declare module "react" {
  interface CSSProperties {
    /** Siła winiety sceny (components/scene/Scrim.tsx). */
    "--scrim-strength"?: number;
  }
}
