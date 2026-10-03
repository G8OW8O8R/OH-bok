import { bootInlineScript } from "@/lib/boot";

/** Plan sekwencji startowej ustawiony przed pierwszym malowaniem (patrz lib/boot.ts). */
export function BootScript() {
  return <script id="boot-script" dangerouslySetInnerHTML={{ __html: bootInlineScript() }} />;
}
