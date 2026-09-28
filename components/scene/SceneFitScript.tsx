import { sceneFitInlineScript } from "@/lib/scene-fit";

/** Pudełko kadru sceny ustawione przed pierwszym malowaniem (patrz lib/scene-fit.ts). */
export function SceneFitScript() {
  return <script id="scene-fit-script" dangerouslySetInnerHTML={{ __html: sceneFitInlineScript() }} />;
}
