import { z } from "zod";

/**
 * Dostawcy AI w osobnym, lekkim module: wiadomości (widget na pulpicie) potrzebują tylko
 * identyfikatorów i nazw, a pełny schemat asystenta ciągnie parser komend – poza pakietem startowym.
 */
export const PROVIDER_IDS = ["groq", "gemini", "cloudflare"] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  groq: "Groq",
  gemini: "Gemini",
  cloudflare: "Cloudflare Workers AI",
};
