"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { StatusCapsule, Window, WindowScroll } from "@/components/system/Window";
import { tabId, tabPanelId, Tabs, type TabItem } from "@/components/ui/Tabs";
import { NewsHeadline } from "@/components/widgets/NewsHeadline";
import { PROVIDER_LABELS } from "@/lib/assistant/schema";
import { duration, ease } from "@/lib/motion";
import type { NewsDigest } from "@/lib/news/schema";
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABELS, NEWS_SOURCES, type NewsCategory } from "@/lib/news/sources";
import { formatTime } from "@/lib/time";

const TABS_ID = "news";
const TABS: TabItem<NewsCategory>[] = NEWS_CATEGORIES.map((id) => ({ id, label: NEWS_CATEGORY_LABELS[id] }));

interface NewsAppProps {
  digest: NewsDigest | null;
  category: NewsCategory;
  onCategory: (category: NewsCategory) => void;
  now: Date;
  timeZone: string;
}

/**
 * Okno Wiadomości: zakładki Polska / Świat nad oknem (ta sama kategoria co w widgecie),
 * „Dziś w skrócie” (streszczenie AI) i ok. 10 nagłówków ze źródłem i godziną – każdy prowadzi
 * do artykułu w nowej karcie. Pod oknem: źródła i stan danych.
 */
export function NewsApp({ digest, category, onCategory, now, timeZone }: NewsAppProps) {
  return (
    <Window
      id="news"
      size="large"
      tabs={<Tabs idPrefix={TABS_ID} label="Kategoria wiadomości" items={TABS} value={category} onChange={onCategory} />}
      status={<NewsStatus digest={digest} category={category} timeZone={timeZone} />}
    >
      <div className="news-app flex min-h-0 flex-1 flex-col">
        {NEWS_CATEGORIES.map((id) => (
          <div
            key={id}
            role="tabpanel"
            id={tabPanelId(TABS_ID, id)}
            aria-labelledby={tabId(TABS_ID, id)}
            hidden={id !== category}
            className="flex min-h-0 flex-1 flex-col"
          >
            {id === category && <NewsPanel digest={digest} category={id} now={now} timeZone={timeZone} />}
          </div>
        ))}
      </div>
    </Window>
  );
}

function NewsPanel({ digest, category, now, timeZone }: { digest: NewsDigest | null; category: NewsCategory; now: Date; timeZone: string }) {
  const reduceMotion = useReducedMotion();
  const summary = digest?.summary ?? null;
  const headlines = digest?.categories[category] ?? [];

  return (
    <WindowScroll className="pt-1">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={category}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? duration.reducedFade : duration.feedback, ease: ease.soft }}
        >
          {summary ? (
            <section aria-labelledby="news-summary-title" className="news-app-summary rounded-[calc(var(--u)*1.1)] bg-white/6 px-5 py-4">
              <h3 id="news-summary-title" className="flex items-center gap-2 text-caption text-white/82">
                <span aria-hidden className="size-1.5 rounded-full bg-amber" />
                Dziś w skrócie · streszczenie AI
              </h3>
              <p className="mt-1.5 text-body text-text-primary" data-testid="news-summary">
                {summary[category]}
              </p>
              <p className="mt-1.5 text-micro text-white/86">
                Wygenerowane z samych nagłówków ({PROVIDER_LABELS[summary.provider]}, {formatTime(new Date(summary.generatedAt), timeZone)}) –
                szczegóły w artykułach źródłowych.
              </p>
            </section>
          ) : digest?.summaryPending ? (
            <p className="rounded-[calc(var(--u)*1.1)] bg-white/6 px-5 py-4 text-caption text-white/82">Przygotowuję skrót dnia…</p>
          ) : null}

          {digest === null ? (
            <p className="py-10 text-center text-body text-text-secondary">Wczytuję nagłówki…</p>
          ) : (
            <ol className="news-app-list mt-4 grid gap-x-[calc(var(--u)*2)] lg:grid-cols-2" data-testid="news-list">
              {headlines.map((headline, index) => (
                <li key={headline.id} className="flex gap-3 border-t border-white/10 py-3">
                  <span aria-hidden className="w-5 shrink-0 pt-0.5 text-right text-caption text-white/74 tabular-nums">
                    {index + 1}
                  </span>
                  <NewsHeadline headline={headline} now={now} timeZone={timeZone} titleClassName="text-body" detailed />
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      </AnimatePresence>
    </WindowScroll>
  );
}

/** Kapsuła pod oknem: źródła kategorii, stan danych, godzina pobrania. */
function NewsStatus({ digest, category, timeZone }: { digest: NewsDigest | null; category: NewsCategory; timeZone: string }) {
  const feeds = digest?.feeds.filter((feed) => feed.category === category) ?? [];
  const names = [...new Set((feeds.length > 0 ? feeds : NEWS_SOURCES.filter((source) => source.category === category)).map((feed) => feed.name))];
  const stale = feeds.some((feed) => feed.state !== "live");
  const state = digest === null ? "Wczytuję" : digest.demo ? "Demo – kanały niedostępne" : stale ? "Część źródeł z pamięci" : "Na żywo";
  const dot = digest === null || stale ? "bg-amber" : digest.demo ? "bg-[#f87171]" : "bg-[#4ade80]";

  return (
    <StatusCapsule>
      <span className="flex items-center gap-2 whitespace-nowrap text-text-primary" data-testid="news-status">
        <span aria-hidden className={`size-2 rounded-full ${dot}`} />
        {state}
      </span>
      <span>
        <span aria-hidden>· </span>
        {names.join(", ")}
      </span>
      {digest && !digest.demo && (
        <span className="whitespace-nowrap tabular-nums">
          <span aria-hidden>· </span>
          {formatTime(new Date(digest.fetchedAt), timeZone)}
        </span>
      )}
    </StatusCapsule>
  );
}
