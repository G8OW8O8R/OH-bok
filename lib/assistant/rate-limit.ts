/**
 * Limit zapytań do asystenta: chroni dzienną pulę darmowych dostawców, żeby jedna osoba nie
 * zablokowała innym. Upstash Redis (REST), jeśli skonfigurowany; inaczej pamięć instancji.
 * IP trafia do kluczy tylko jako skrót (SHA-256, 16 znaków).
 */

export const RATE_LIMITS = {
  /** Na IP na minutę. */
  minute: 8,
  /** Na IP na dobę (UTC). */
  day: 40,
  /** Wszyscy razem na dobę (UTC) – ochrona puli. */
  global: 800,
} as const;

export interface CounterStore {
  /** Zwiększa licznik i zwraca nową wartość; klucz wygasa po `ttlS` od pierwszego zapisu. */
  increment(key: string, ttlS: number): Promise<number>;
}

export function memoryCounterStore(now: () => number = Date.now): CounterStore {
  const counters = new Map<string, { value: number; expiresAt: number }>();
  return {
    async increment(key, ttlS) {
      const at = now();
      if (counters.size > 5000) for (const [k, entry] of counters) if (entry.expiresAt <= at) counters.delete(k);
      const current = counters.get(key);
      const entry = current && current.expiresAt > at ? current : { value: 0, expiresAt: at + ttlS * 1000 };
      entry.value += 1;
      counters.set(key, entry);
      return entry.value;
    },
  };
}

/** Upstash Redis przez REST (`/pipeline`: INCR + EXPIRE NX), bez dodatkowej biblioteki. */
export function upstashCounterStore(url: string, token: string, fetchImpl: typeof fetch = fetch): CounterStore {
  return {
    async increment(key, ttlS) {
      const response = await fetchImpl(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(ttlS), "NX"],
        ]),
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Upstash HTTP ${response.status}`);
      const json: unknown = await response.json();
      const first: unknown = Array.isArray(json) ? json[0] : null;
      const result = first !== null && typeof first === "object" && "result" in first ? first.result : null;
      if (typeof result !== "number") throw new Error("Upstash: nieoczekiwana odpowiedź");
      return result;
    },
  };
}

export type RateLimitResult = { ok: true } | { ok: false; scope: "minute" | "day" | "global"; retryAfterS: number };

async function ipHash(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`obok:${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Sprawdza i zalicza zapytanie. Awaria Upstash nie wyłącza asystenta: wtedy liczy pamięć instancji
 * (`fallback`).
 */
export async function checkRateLimit(store: CounterStore, ip: string, now: Date, fallback?: CounterStore): Promise<RateLimitResult> {
  const id = await ipHash(ip);
  const minute = Math.floor(now.getTime() / 60_000);
  const day = now.toISOString().slice(0, 10);
  const untilMidnight = Math.max(1, Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now.getTime()) / 1000));
  const run = async (counters: CounterStore): Promise<RateLimitResult> => {
    const [perMinute, perDay, global] = await Promise.all([
      counters.increment(`obok:ai:m:${id}:${minute}`, 60),
      counters.increment(`obok:ai:d:${id}:${day}`, 86_400),
      counters.increment(`obok:ai:g:${day}`, 86_400),
    ]);
    if (perMinute > RATE_LIMITS.minute) return { ok: false, scope: "minute", retryAfterS: 60 - (Math.floor(now.getTime() / 1000) % 60) };
    if (perDay > RATE_LIMITS.day) return { ok: false, scope: "day", retryAfterS: untilMidnight };
    if (global > RATE_LIMITS.global) return { ok: false, scope: "global", retryAfterS: untilMidnight };
    return { ok: true };
  };
  try {
    return await run(store);
  } catch (error) {
    if (!fallback) throw error;
    return run(fallback);
  }
}

/** IP klienta z nagłówków proxy (Vercel ustawia `x-forwarded-for`). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
