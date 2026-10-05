"use client";

import { Maximize2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MouseEvent } from "react";
import { Glass } from "@/components/ui/Glass";
import { Segmented, type SegmentItem } from "@/components/ui/Segmented";
import { duration, ease } from "@/lib/motion";
import type { NewsDigest } from "@/lib/news/schema";
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABELS, type NewsCategory } from "@/lib/news/sources";
import { originLayoutId } from "@/lib/windows/apps";
import { NewsHeadline } from "./NewsHeadline";

interface NewsProps {
  digest: NewsDigest | null;
  category: NewsCategory;
  onCategory: (category: NewsCategory) => void;
  now: Date;
  timeZone: string;
  /** Otwiera okno Wiadomości, które rozwija się z kafelka (przejście współdzielone). */
  onOpen: () => void;
}

const VISIBLE = 3;

const CATEGORY_ITEMS: SegmentItem<NewsCategory>[] = NEWS_CATEGORIES.map((id) => ({ id, label: NEWS_CATEGORY_LABELS[id] }));

/**
 * „Najważniejsze dziś”: przełącznik Polska / Świat, „Dziś w skrócie”
 * (streszczenie AI z samych nagłówków) i 3 najważniejsze nagłówki. Nagłówek prowadzi do artykułu
 * w nowej karcie; klik w resztę kafelka albo ikona otwiera okno z pełną listą.
 */
export function News({ digest, category, onCategory, now, timeZone, onOpen }: NewsProps) {
  const reduceMotion = useReducedMotion();
  const headlines = digest?.categories[category].slice(0, VISIBLE) ?? [];
  const summary = digest?.summary?.[category] ?? null;
  const pending = digest?.summaryPending ?? false;
  const fade = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: reduceMotion ? duration.reducedFade : duration.feedback, ease: ease.soft },
  };

  // Klik w tło kafelka otwiera okno; linki, przyciski i przełącznik działają po swojemu.
  const openFromSurface = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a, button")) return;
    onOpen();
  };

  return (
    <Glass
      layoutId={originLayoutId("news", "tile")}
      depth="mid"
      role="region"
      aria-labelledby="news-title"
      aria-busy={digest === null}
      id="news"
      tabIndex={-1}
      data-testid="news"
      data-demo={digest?.demo || undefined}
      onClick={openFromSurface}
      className="news-widget flex shrink-0 cursor-pointer flex-col rounded-widget"
    >
      <h2 id="news-title" className="sr-only">
        Najważniejsze dziś
      </h2>
      <div className="flex items-center gap-2 pr-8">
        <Segmented label="Kategoria wiadomości" items={CATEGORY_ITEMS} value={category} onChange={onCategory} className="news-switch" />
        {digest?.demo && (
          <span className="rounded-pill bg-white/10 px-2 py-0.5 text-micro text-white/82" title="Kanały niedostępne – przykładowe nagłówki">
            demo
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Otwórz Wiadomości"
        title="Otwórz Wiadomości"
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-text-secondary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary pointer-coarse:size-11"
      >
        <Maximize2 aria-hidden className="size-4" strokeWidth={1.75} />
      </button>

      {digest === null ? (
        <NewsSkeleton />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={category} {...fade} className="news-body flex min-h-0 flex-1 flex-col">
            {(summary || pending) && (
              <section aria-label="Dziś w skrócie, streszczenie AI" className="news-summary">
                <p aria-hidden className="flex items-center gap-1.5 text-micro text-white/82" title="Streszczenie AI wygenerowane wyłącznie z nagłówków">
                  <span className="size-1.5 rounded-full bg-amber" />
                  Dziś w skrócie · AI
                </p>
                {summary ? (
                  <motion.p
                    key={summary}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduceMotion ? duration.reducedFade : 0.6, ease: ease.soft }}
                    className="news-summary-text line-clamp-2 text-text-primary"
                    title={summary}
                  >
                    {summary}
                  </motion.p>
                ) : (
                  <p className="news-summary-text text-white/82">Przygotowuję skrót dnia…</p>
                )}
              </section>
            )}
            <ol className="news-list flex min-h-0 flex-1 flex-col">
              {headlines.map((headline) => (
                <li key={headline.id}>
                  <NewsHeadline headline={headline} now={now} timeZone={timeZone} titleClassName="news-title" />
                </li>
              ))}
            </ol>
          </motion.div>
        </AnimatePresence>
      )}
    </Glass>
  );
}

/** Szkielet o rozmiarze treści: dane przychodzą po hydracji bez przesunięć układu. */
function NewsSkeleton() {
  return (
    <div aria-hidden className="news-body flex flex-1 flex-col">
      <div className="news-summary">
        <span className="block h-[0.9em] w-1/3 rounded-pill bg-white/8 text-micro" />
        <span className="mt-2 block h-[1em] w-full rounded-pill bg-white/8 text-caption" />
      </div>
      <div className="news-list flex flex-1 flex-col">
        {Array.from({ length: VISIBLE }, (_, i) => (
          <span key={i} className="block">
            <span className="block h-[1em] w-11/12 rounded-pill bg-white/8 text-caption" />
            <span className="mt-1.5 block h-[0.8em] w-1/4 rounded-pill bg-white/6 text-micro" />
          </span>
        ))}
      </div>
    </div>
  );
}
