import { ExternalLink } from "lucide-react";
import type { Headline } from "@/lib/news/schema";
import { formatPublished } from "@/lib/time";

interface NewsHeadlineProps {
  headline: Headline;
  now: Date;
  timeZone: string;
  /** Klasa tytułu (rozmiar różni się w widgecie i w oknie). */
  titleClassName: string;
  /** Okno: „także: …” i ikona linku zewnętrznego. */
  detailed?: boolean;
}

/**
 * Nagłówek wiadomości: tytuł jako link do artykułu w nowej karcie (maks. 2 linie z wielokropkiem),
 * pod nim źródło i godzina w stonowanym kolorze. Tylko nagłówek – bez treści artykułu.
 */
export function NewsHeadline({ headline, now, timeZone, titleClassName, detailed = false }: NewsHeadlineProps) {
  const at = new Date(headline.publishedAt);
  return (
    <article className="min-w-0" data-testid="news-headline">
      <a
        href={headline.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`news-link group/link block rounded-[0.375rem] text-text-primary transition-colors duration-(--dur-feedback) hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${titleClassName}`}
      >
        <span className="line-clamp-2">
          {headline.title}
          {detailed && (
            <ExternalLink
              aria-hidden
              className="ml-1.5 inline size-[0.85em] -translate-y-px text-text-secondary opacity-0 transition-opacity duration-(--dur-feedback) group-hover/link:opacity-100 group-focus-visible/link:opacity-100"
              strokeWidth={1.75}
            />
          )}
        </span>
        <span className="sr-only"> (otwiera się w nowej karcie)</span>
      </a>
      <p className="news-meta mt-0.5 truncate text-micro tabular-nums">
        {headline.source}
        <span aria-hidden> · </span>
        <time dateTime={headline.publishedAt}>{formatPublished(at, now, timeZone)}</time>
        {detailed && headline.alsoIn.length > 0 && (
          <>
            <span aria-hidden> · </span>
            także: {headline.alsoIn.join(", ")}
          </>
        )}
      </p>
    </article>
  );
}
