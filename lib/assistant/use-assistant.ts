"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askAssistant, type ClientEvent } from "./client";
import type { AssistantContext } from "./context";
import type { AssistantCommand, AssistantErrorCode, ProviderId } from "./schema";

export type AnswerStatus = "waiting" | "streaming" | "done" | "error";

export interface AssistantAnswer {
  key: number;
  /** Zapytanie dokładnie tak, jak było w polu (odpowiedź należy do tego tekstu). */
  query: string;
  status: AnswerStatus;
  provider: ProviderId | null;
  text: string;
  commands: AssistantCommand[] | null;
  error: { code: AssistantErrorCode; message: string } | null;
}

function reduce(answer: AssistantAnswer, event: ClientEvent): AssistantAnswer {
  switch (event.type) {
    case "provider":
      return { ...answer, provider: event.provider };
    case "text":
      return { ...answer, status: "streaming", text: answer.text + event.delta };
    case "commands":
      return { ...answer, commands: event.commands };
    case "done":
      return answer.status === "error" ? answer : { ...answer, status: "done" };
    case "error":
      return { ...answer, status: "error", error: { code: event.code, message: event.message } };
  }
}

/** Pytanie do asystenta AI ze Spotlightu: stan odpowiedzi, anulowanie przy zmianie pola i zamknięciu. */
export function useAssistant() {
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const keyRef = useRef(0);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setAnswer(null);
  }, []);

  const ask = useCallback((query: string, context: AssistantContext) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    keyRef.current += 1;
    const key = keyRef.current;
    setAnswer({ key, query, status: "waiting", provider: null, text: "", commands: null, error: null });
    const onEvent = (event: ClientEvent) => setAnswer((current) => (current?.key === key ? reduce(current, event) : current));
    askAssistant({ query: query.trim(), context }, onEvent, abort.signal).catch(() => {
      // Przerwane (nowe pytanie, zmiana pola, zamknięcie) – stan już wyczyszczony.
    });
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { answer, ask, cancel };
}

/** Tempo odsłaniania odpowiedzi (słowo po słowie) i jak długo kula „mówi” po całości przy reduced motion. */
export const REVEAL_MS_PER_WORD = 45;
const REDUCED_SPEAK_MS = 1200;

/** Pierwsze `count` słów tekstu (z odstępami po nich). */
export function revealWords(text: string, count: number): string {
  const words = text.match(/\S+\s*/g) ?? [];
  return words.slice(0, count).join("").trimEnd();
}

export function wordCount(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

/**
 * Odsłanianie odpowiedzi: Groq oddaje całość w ~100 ms, więc tempo nadaje klient (słowo co 45 ms,
 * dogania strumień). `revealing` = kula „mówi”. Reduced motion: całość od razu po zakończeniu.
 */
export function useReveal(key: number | null, text: string, complete: boolean, reduceMotion: boolean): { visible: string; revealing: boolean } {
  const total = wordCount(text);
  const [shown, setShown] = useState({ key, count: 0 });
  /** Reduced motion: odpowiedź, po której kula już przestała „mówić”. */
  const [released, setReleased] = useState<number | null>(null);
  const count = shown.key === key ? shown.count : 0;
  if (shown.key !== key) setShown({ key, count: 0 });

  useEffect(() => {
    if (reduceMotion || count >= total) return;
    const timer = window.setTimeout(() => setShown({ key, count: count + 1 }), REVEAL_MS_PER_WORD);
    return () => window.clearTimeout(timer);
  }, [reduceMotion, count, total, key]);

  useEffect(() => {
    if (!reduceMotion || !complete || total === 0) return;
    const timer = window.setTimeout(() => setReleased(key), REDUCED_SPEAK_MS);
    return () => window.clearTimeout(timer);
  }, [reduceMotion, complete, total, key]);

  if (reduceMotion) return { visible: complete ? text : "", revealing: total > 0 && (!complete || released !== key) };
  return { visible: revealWords(text, count), revealing: count < total || (!complete && total > 0) };
}
