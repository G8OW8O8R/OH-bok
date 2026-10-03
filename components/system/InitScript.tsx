import { bootInlineScript } from "@/lib/boot";
import { sceneFitInlineScript } from "@/lib/scene-fit";

/**
 * Jedyny skrypt inline przed pierwszym malowaniem: pudełko kadru sceny (lib/scene-fit.ts)
 * i plan sekwencji startowej (lib/boot.ts). Stoi na początku <body>, nie w <head>: rozszerzenia
 * przeglądarki wstrzykują do <head> własne `<script src>` (bez `async`), a React przy hydracji
 * brał taki skrypt za nasz i zgłaszał niezgodność atrybutów. Parser nie doszedł jeszcze do treści
 * strony, więc skrypt nadal działa przed pierwszym malowaniem.
 */
export function InitScript() {
  return <script id="obok-init" dangerouslySetInnerHTML={{ __html: sceneFitInlineScript() + bootInlineScript() }} />;
}
