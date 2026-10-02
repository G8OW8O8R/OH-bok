"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { duration, ease, spring, transitionFor } from "@/lib/motion";
import { Glass } from "./Glass";

interface WidgetPanelProps {
  open: boolean;
  onClose: () => void;
  /** Ten sam `layoutId` ma kafelek, z którego panel się rozwija (przejście współdzielone). */
  layoutId: string;
  /** Prefiks identyfikatorów (`<id>-title`) i `data-testid`. */
  id: string;
  title: string;
  /** Szerszy panel (formularz z kalendarzem). */
  wide?: boolean;
  /**
   * Treść pod nagłówkiem. Panel ma stałą maks. wysokość: przewijana część to `PanelScroll`,
   * a to, co musi być zawsze osiągalne (pole dodawania, przycisk „Dodaj”), stoi poza nią.
   */
  children: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Panel rozwijany z kafelka pulpitu: szklane okno w trybie modalnym (`role="dialog"`),
 * Esc zamyka, Tab krąży wewnątrz, fokus wraca na element, który go otworzył.
 *
 * To jest baza systemu okien (zadanie 7): okno aplikacji = ten sam mechanizm (`layoutId`
 * z ikony/kafelka, sprężyna, fokus, Esc) + przeciąganie z bezwładnością i zapamiętanie pozycji
 * dokładane tu, a nie drugi, równoległy komponent.
 */
export function WidgetPanel({ open, ...props }: WidgetPanelProps) {
  return <AnimatePresence>{open && <PanelBody key={props.id} {...props} />}</AnimatePresence>;
}

/** Przewijana część panelu (na niskich ekranach i przy długich listach). */
export function PanelScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div data-panel-scroll className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 ${className ?? ""}`}>{children}</div>;
}

/** Stopka poza przewijaniem: główna akcja panelu jest zawsze widoczna. */
export function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-6 py-4">{children}</div>;
}

function PanelBody({ onClose, layoutId, id, title, wide, children }: Omit<WidgetPanelProps, "open">) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      // Esc obsłużony głębiej (np. zwinięcie wyboru daty) nie zamyka panelu.
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        firstItem.focus();
      } else if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const layoutTransition = transitionFor(reduceMotion, spring.gentle);
  const backdropTransition = transitionFor(reduceMotion, { duration: duration.feedback, ease: ease.soft });

  return (
    <motion.div
      className="fixed inset-0 z-40 grid place-items-center p-4"
      initial={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: duration.feedback }}
    >
      {/* Pulpit cofa się za panel: przyciemnienie + mocniejsze rozmycie (stałe), wjeżdża tylko kryciem. */}
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label="Zamknij"
        onClick={onClose}
        data-testid="panel-backdrop"
        className="panel-backdrop absolute inset-0 cursor-default"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={backdropTransition}
      />
      <Glass
        layoutId={layoutId}
        transition={layoutTransition}
        depth="near"
        parallax={false}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={`${id}-panel`}
        className={`relative flex max-h-[min(calc(100dvh-2rem),calc(var(--u)*46))] flex-col overflow-hidden rounded-window ${wide ? "w-[min(calc(var(--u)*38),calc(100vw-2rem))]" : "w-[min(calc(var(--u)*34),calc(100vw-2rem))]"}`}
      >
        <motion.div
          ref={panelRef}
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: reduceMotion ? 0 : 0.12, duration: duration.feedback } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 id={titleId} className="text-title font-medium text-text-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij"
              className="-mr-2 grid size-9 place-items-center rounded-full text-text-secondary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary"
            >
              <X aria-hidden className="size-5" strokeWidth={1.75} />
            </button>
          </header>
          {children}
        </motion.div>
      </Glass>
    </motion.div>
  );
}
