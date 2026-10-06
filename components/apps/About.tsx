"use client";

import { motion, useReducedMotion } from "motion/react";
import { Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Window, WindowFooter, WindowScroll } from "@/components/system/Window";
import {
  ABOUT_SUMMARY,
  ATTRIBUTIONS,
  AUTHOR,
  buildInfo,
  PRIVACY_NOTE,
  SCENES_CREDIT,
  STORED_DATA,
  TECHNOLOGIES,
} from "@/lib/about";
import { DEMO_PARAM } from "@/lib/demo/mode";
import { duration, ease } from "@/lib/motion";
import { clearUserData } from "@/lib/privacy";
import { ArchitectureDiagram } from "./about/ArchitectureDiagram";

const BUILD = buildInfo({ commit: process.env.OBOK_COMMIT, builtAt: process.env.OBOK_BUILT_AT, repo: process.env.OBOK_REPO });

const LINK = "underline decoration-white/35 underline-offset-2 transition-colors duration-(--dur-feedback) hover:decoration-amber";

const PRIMARY =
  "flex shrink-0 items-center gap-2 rounded-pill bg-amber px-5 py-2.5 text-body font-medium text-[rgb(20_14_8)] transition-[scale] duration-(--dur-feedback) ease-out hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95";

const SECONDARY =
  "inline-flex items-center gap-2 rounded-pill bg-white/8 px-4 py-2 text-caption text-text-primary transition-colors duration-(--dur-feedback) hover:bg-white/14";

/**
 * Okno „O systemie”: o projekcie i autorze, schemat architektury, technologie, prywatność
 * z „Wyczyść moje dane”, atrybucje źródeł, wersja i „Uruchom demo” (jedyny bursztynowy przycisk).
 */
export function AboutApp({ timeZone }: { timeZone: string }) {
  return (
    <Window id="about" size="large">
      <WindowScroll className="pt-1 pb-4!">
        <div className="about-app grid gap-x-[calc(var(--u)*2)] gap-y-4 lg:grid-cols-[1.25fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <p className="text-body text-text-primary">{ABOUT_SUMMARY}</p>
              <p className="mt-2 text-caption text-white/82">
                Projekt i kod: {AUTHOR.name}, {AUTHOR.studio} ·{" "}
                {AUTHOR.links.map((link, index) => (
                  <span key={link.href}>
                    {index > 0 && " · "}
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className={`${LINK} text-text-primary`}>
                      {link.label}
                    </a>
                  </span>
                ))}
              </p>
            </div>
            <Section title="Architektura">
              <ArchitectureDiagram />
            </Section>
            <Section title="Technologie">
              <ul className="flex flex-wrap gap-1.5" aria-label="Technologie">
                {TECHNOLOGIES.map((name) => (
                  <li key={name} className="rounded-pill bg-white/8 px-3 py-1 text-caption text-text-primary">
                    {name}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Section title="Prywatność">
              <Privacy />
            </Section>
            <Section title="Źródła danych i atrybucje">
              <ul className="grid gap-1 text-caption text-text-primary" data-testid="attributions">
                {ATTRIBUTIONS.map((group) => (
                  <li key={group.label}>
                    <span className="text-white/82">{group.label}: </span>
                    {group.sources.map((source, index) => (
                      <span key={source.href}>
                        {index > 0 && ", "}
                        <a href={source.href} target="_blank" rel="noopener noreferrer" className={LINK}>
                          {source.name}
                        </a>
                        {source.note && <span className="text-white/82"> ({source.note})</span>}
                      </span>
                    ))}
                    {group.detail && <span className="text-white/82"> – {group.detail}</span>}
                  </li>
                ))}
                <li>
                  <span className="text-white/82">{SCENES_CREDIT.label}: </span>
                  {SCENES_CREDIT.value}
                </li>
              </ul>
            </Section>
          </div>
        </div>
      </WindowScroll>
      <WindowFooter>
        <p className="min-w-0 flex-1 truncate text-caption text-white/82" data-testid="about-version">
          Wersja: <Version timeZone={timeZone} />
        </p>
        {/* Pełne przejście: demo startuje od czystego pulpitu, na danych w pamięci. */}
        <a href={`/?${DEMO_PARAM}=1`} className={PRIMARY}>
          <Play aria-hidden className="size-4" strokeWidth={2} />
          Uruchom demo
        </a>
      </WindowFooter>
    </Window>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-caption font-medium tracking-wide text-white/82 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Version({ timeZone }: { timeZone: string }) {
  if (!BUILD.commit) return <span className="text-text-primary">lokalnie</span>;
  const date = BUILD.builtAt
    ? new Intl.DateTimeFormat("pl-PL", { timeZone, day: "numeric", month: "long", year: "numeric" }).format(BUILD.builtAt)
    : null;
  return (
    <span className="text-text-primary tabular-nums">
      {BUILD.href ? (
        <a href={BUILD.href} target="_blank" rel="noopener noreferrer" className={LINK}>
          {BUILD.commit}
        </a>
      ) : (
        BUILD.commit
      )}
      {date && ` · build ${date}`}
    </span>
  );
}

type ClearState = "idle" | "confirm" | "done";

/** Lista zapisanych danych i „Wyczyść moje dane” z potwierdzeniem w karcie (bez okna przeglądarki). */
function Privacy() {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<ClearState>("idle");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [focusTarget, setFocusTarget] = useState<ClearState | null>(null);

  // Fokus podąża za zmianą przycisków (żaden nie znika spod fokusu na body).
  useEffect(() => {
    if (focusTarget === "confirm") confirmRef.current?.focus();
    if (focusTarget === "idle") startRef.current?.focus();
    if (focusTarget === "done") statusRef.current?.focus();
  }, [focusTarget]);

  const go = (next: ClearState) => {
    setState(next);
    setFocusTarget(next);
  };

  const transition = { duration: reduceMotion ? duration.reducedFade : duration.feedback, ease: ease.soft };

  return (
    <div>
      <ul className="grid gap-0.5 text-caption" data-testid="stored-data">
        {STORED_DATA.map((item) => (
          <li key={item.key} className="flex items-baseline gap-2">
            <code className="shrink-0 rounded-md bg-white/8 px-1.5 text-text-primary">{item.key}</code>
            <span className="min-w-0 text-white/82">
              {item.what}
              {item.where === "ciasteczko" && " (ciasteczko)"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-micro text-white/82">{PRIVACY_NOTE}</p>
      <div className="mt-2.5 min-h-10">
          {state === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition}>
              <button ref={startRef} type="button" className={SECONDARY} onClick={() => go("confirm")}>
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                Wyczyść moje dane
              </button>
            </motion.div>
          )}
          {state === "confirm" && (
            <motion.div
              key="confirm"
              role="group"
              aria-labelledby="about-clear-question"
              className="flex flex-wrap items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transition}
            >
              <span id="about-clear-question" className="text-caption text-text-primary">
                Usunąć listę, przypomnienia, alerty i lokalizację?
              </span>
              <button
                ref={confirmRef}
                type="button"
                className={`${SECONDARY} bg-[rgb(248_113_113/0.22)] hover:bg-[rgb(248_113_113/0.32)]`}
                onClick={() => {
                  clearUserData();
                  go("done");
                }}
              >
                Tak, usuń
              </button>
              <button type="button" className={SECONDARY} onClick={() => go("idle")}>
                Anuluj
              </button>
            </motion.div>
          )}
          {state === "done" && (
            <motion.p
              key="done"
              ref={statusRef}
              tabIndex={-1}
              role="status"
              className="text-caption text-text-primary outline-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transition}
            >
              Dane usunięte. Pogoda wróci do Gdańska po odświeżeniu strony.
            </motion.p>
          )}
      </div>
    </div>
  );
}
