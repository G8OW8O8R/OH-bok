import { PROVIDER_IDS, providerIdSchema, type ProviderId } from "./schema";

/**
 * Dostawcy modeli: darmowe API bez karty, kolejność z `AI_PROVIDER_ORDER`.
 * Przełączenie na następnego przy błędzie, limicie (429) albo braku pierwszego fragmentu w 8 s.
 * Po pierwszym fragmencie już nie przełączamy (część odpowiedzi poszła do klienta).
 * Klucze tylko tutaj (serwer) – nigdy w logach ani w odpowiedzi.
 */

export const FIRST_CHUNK_TIMEOUT_MS = 8000;

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  groq: "openai/gpt-oss-120b",
  gemini: "gemini-3.5-flash-lite",
  cloudflare: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

export interface ProviderConfig {
  id: ProviderId;
  model: string;
  apiKey: string;
  /** Tylko Cloudflare. */
  accountId?: string;
}

export interface ChatPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

type Env = Record<string, string | undefined>;

/** Dostawcy z kluczami, w kolejności z `AI_PROVIDER_ORDER` (bez duplikatów i nieznanych nazw). */
export function providersFromEnv(env: Env): ProviderConfig[] {
  const order = (env.AI_PROVIDER_ORDER?.trim() || PROVIDER_IDS.join(","))
    .split(",")
    .map((name) => providerIdSchema.safeParse(name.trim().toLowerCase()))
    .flatMap((result) => (result.success ? [result.data] : []));
  const configs: ProviderConfig[] = [];
  for (const id of new Set(order)) {
    const value = (name: string) => env[name]?.trim() || undefined;
    const model = value(`${id.toUpperCase()}_MODEL`) ?? DEFAULT_MODELS[id];
    if (id === "groq" && value("GROQ_API_KEY")) configs.push({ id, model, apiKey: value("GROQ_API_KEY") ?? "" });
    if (id === "gemini" && value("GEMINI_API_KEY")) configs.push({ id, model, apiKey: value("GEMINI_API_KEY") ?? "" });
    if (id === "cloudflare" && value("CLOUDFLARE_API_TOKEN") && value("CLOUDFLARE_ACCOUNT_ID")) {
      configs.push({ id, model, apiKey: value("CLOUDFLARE_API_TOKEN") ?? "", accountId: value("CLOUDFLARE_ACCOUNT_ID") });
    }
  }
  return configs;
}

function buildRequest(provider: ProviderConfig, prompt: ChatPrompt): { url: string; init: RequestInit } {
  const messages = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
  switch (provider.id) {
    case "groq":
      return {
        url: "https://api.groq.com/openai/v1/chat/completions",
        init: {
          method: "POST",
          headers: { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: provider.model,
            messages,
            stream: true,
            temperature: 0.3,
            max_completion_tokens: prompt.maxTokens,
            // gpt-oss rozumuje: krótko i bez rozumowania w treści.
            ...(provider.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", include_reasoning: false } : {}),
          }),
        },
      };
    case "cloudflare":
      return {
        url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(provider.accountId ?? "")}/ai/v1/chat/completions`,
        init: {
          method: "POST",
          headers: { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: provider.model, messages, stream: true, temperature: 0.3, max_tokens: prompt.maxTokens }),
        },
      };
    case "gemini":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:streamGenerateContent?alt=sse`,
        init: {
          method: "POST",
          headers: { "x-goog-api-key": provider.apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: prompt.system }] },
            contents: [{ role: "user", parts: [{ text: prompt.user }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: prompt.maxTokens,
              ...(provider.model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
            },
          }),
        },
      };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Fragment tekstu z jednego zdarzenia SSE (bez „myśli” modelu). */
export function extractDelta(id: ProviderId, payload: unknown): string {
  const root = record(payload);
  if (!root) return "";
  if (root.error) throw new ProviderError(id, "http");
  if (id === "gemini") {
    const candidate = record(Array.isArray(root.candidates) ? root.candidates[0] : null);
    const parts = record(candidate?.content)?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
      .map(record)
      .filter((part) => part && part.thought !== true && typeof part.text === "string")
      .map((part) => String(part?.text))
      .join("");
  }
  const choice = record(Array.isArray(root.choices) ? root.choices[0] : null);
  const content = record(choice?.delta)?.content;
  return typeof content === "string" ? content : "";
}

/** Fragmenty tekstu ze strumienia SSE (`data: {...}`, koniec na `[DONE]` albo końcu treści). */
export async function* readDeltas(id: ProviderId, body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const data = /^data:\s?(.*)$/.exec(line.trim())?.[1];
        if (data === undefined || data === "") continue;
        if (data === "[DONE]") return;
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = extractDelta(id, payload);
        if (delta) yield delta;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

export type FailureKind = "limit" | "http" | "timeout" | "network" | "empty";

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly kind: FailureKind,
    readonly status?: number,
  ) {
    super(`${provider}: ${kind}${status ? ` (${status})` : ""}`);
  }
}

export class AllProvidersFailed extends Error {
  constructor(readonly failures: ProviderError[]) {
    super(failures.map((failure) => failure.message).join("; ") || "brak dostawców");
  }

  /** Wszyscy odmówili z powodu limitu: komunikat „asystent odpoczywa”. */
  get limited(): boolean {
    return this.failures.length > 0 && this.failures.every((failure) => failure.kind === "limit");
  }
}

export interface ProviderStream {
  provider: ProviderId;
  /** Pierwszy niepusty fragment (już odebrany). */
  first: string;
  rest: AsyncIterator<string>;
  /** Przerywa zapytanie do dostawcy (limit zdań, rozłączenie klienta, limit czasu). */
  abort: () => void;
  failures: ProviderError[];
}

export interface OpenStreamOptions {
  fetch?: typeof fetch;
  firstChunkTimeoutMs?: number;
  signal?: AbortSignal;
}

/** Pierwszy dostawca, który w terminie odda fragment odpowiedzi; reszta jako przyczyny. */
export async function openStream(providers: readonly ProviderConfig[], prompt: ChatPrompt, options: OpenStreamOptions = {}): Promise<ProviderStream> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS;
  const failures: ProviderError[] = [];

  for (const provider of providers) {
    if (options.signal?.aborted) break;
    const controller = new AbortController();
    const forward = () => controller.abort();
    options.signal?.addEventListener("abort", forward, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", forward);
      controller.abort();
    };

    try {
      const { url, init } = buildRequest(provider, prompt);
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderError(provider.id, response.status === 429 ? "limit" : "http", response.status);
      }
      const rest = readDeltas(provider.id, response.body);
      const next = await rest.next();
      if (next.done) throw new ProviderError(provider.id, "empty");
      clearTimeout(timer);
      return { provider: provider.id, first: next.value, rest, abort, failures };
    } catch (error) {
      abort();
      if (error instanceof ProviderError) failures.push(error);
      else failures.push(new ProviderError(provider.id, timedOut ? "timeout" : "network"));
    }
  }
  throw new AllProvidersFailed(failures);
}
