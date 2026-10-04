"use client";

import { X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type PanInfo,
} from "motion/react";
import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Glass } from "@/components/ui/Glass";
import { duration, ease, spring, transitionFor } from "@/lib/motion";
import { APPS, originLayoutId, type AppId } from "@/lib/windows/apps";
import {
  clampOffset,
  dragBounds,
  initialOffset,
  shouldDismissSheet,
  toSaved,
  type AreaInsets,
  type DragBounds,
} from "@/lib/windows/position";
import { windowLayer } from "@/lib/windows/stack";
import { useWindowsStore } from "@/store/windows";
import { useWindows } from "./Windows";

export type WindowSize = "regular" | "wide" | "large";

interface WindowProps {
  id: AppId;
  /** Szerokość okna na desktopie: lista, formularz z kalendarzem, aplikacja (Pogoda). */
  size?: WindowSize;
  /** Ornament nad oknem: kapsuła zakładek (na telefonie pod nagłówkiem). */
  tabs?: ReactNode;
  /** Ornament pod oknem: kapsuła statusu (na telefonie na dole arkusza). */
  status?: ReactNode;
  /** Panel boczny po lewej, lekko obrócony w 3D (na telefonie sekcja pod treścią). */
  aside?: ReactNode;
  /**
   * Treść pod nagłówkiem. Okno ma stałą maks. wysokość: przewijana część to `WindowScroll`,
   * a to, co musi być zawsze osiągalne (pole dodawania, główny przycisk), stoi poza nią.
   */
  children: ReactNode;
}

const WIDTH: Record<WindowSize, string> = {
  regular: "w-[min(calc(var(--u)*34),calc(100vw-2rem))]",
  wide: "w-[min(calc(var(--u)*38),calc(100vw-2rem))]",
  large: "w-[min(calc(var(--u)*62),calc(100vw-2rem))]",
};

/** Warstwa okien: nad tłem pulpitu (z-40), kolejne okna wyżej. */
const LAYER_BASE = 41;
/** Kolejne okno bez zapamiętanej pozycji schodzi kaskadą o tyle pikseli. */
const CASCADE_PX = 36;
const EDGE_PX = 16;
/** Miejsce na jeden ornament (kapsuła + odstęp). */
const ORNAMENT_PX = 60;
/** Okno bez źródła (z linku) znika krótkim przenikaniem, nie sprężyną. */
const quickExit = { duration: 0.18, ease: ease.soft };
/** Przechył przy przeciąganiu: stopnie przy danej prędkości (px/s). */
const TILT = { velocity: 1200, degrees: 4 } as const;

/** Obszar okien: krawędzie ekranu, a u dołu miejsce na dock (zostaje nad tłem i jest klikalny). */
function measureInsets(): AreaInsets {
  const dock = document.querySelector('[data-testid="dock"]')?.getBoundingClientRect();
  const bottom = dock && dock.height > 0 ? window.innerHeight - dock.top + EDGE_PX * 0.75 : EDGE_PX;
  return { top: EDGE_PX, bottom: Math.max(EDGE_PX, bottom), side: EDGE_PX };
}

/** Okno aplikacji: jedna powłoka dla wszystkich aplikacji. */
export function Window(props: WindowProps) {
  const { visible, sheets } = useWindows();
  const shown = visible.includes(props.id);
  return (
    <AnimatePresence>
      {shown && (sheets ? <SheetBody key={`${props.id}-sheet`} {...props} /> : <WindowBody key={props.id} {...props} />)}
    </AnimatePresence>
  );
}

/** Przewijana część okna (na niskich ekranach i przy długich listach). */
export function WindowScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div data-panel-scroll className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 ${className ?? ""}`}>{children}</div>;
}

/** Stopka poza przewijaniem: główna akcja okna jest zawsze widoczna. */
export function WindowFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center gap-3 border-t border-white/10 px-6 py-4 max-lg:pb-[max(1rem,env(safe-area-inset-bottom))] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Wspólne dla okna i arkusza: tożsamość, warstwa, przejście współdzielone. */
function useWindowShell(id: AppId) {
  const windows = useWindows();
  const reduceMotion = useReducedMotion();
  const origin = windows.originOf(id);
  const isTop = windows.stack[windows.stack.length - 1] === id;
  return {
    windows,
    reduceMotion,
    isTop,
    titleId: `window-${id}-title`,
    layer: windowLayer(windows.stack, id, LAYER_BASE),
    // Okno rozwija się z elementu, który je otworzył; z linku – skalą i kryciem.
    layoutId: origin ? originLayoutId(id, origin) : undefined,
    layoutTransition: transitionFor(reduceMotion, spring.gentle),
    content: {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { delay: reduceMotion ? 0 : 0.12, duration: duration.feedback } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    },
  };
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Zamknij"
      className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-text-secondary pointer-coarse:size-11 transition-colors duration-(--dur-feedback) hover:bg-white/14 hover:text-text-primary"
    >
      <X aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  );
}

/** Przeciąganie zaczyna się tylko na pustym miejscu nagłówka (przyciski działają normalnie). */
function startsDrag(event: PointerEvent): boolean {
  return event.button === 0 && !(event.target as Element).closest("button,a,input,[role=tab]");
}

function WindowBody({ id, size = "regular", tabs, status, aside, children }: WindowProps) {
  const { windows, reduceMotion, isTop, titleId, layer, layoutId, layoutTransition, content } = useWindowShell(id);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Lekki przechył z prędkości poziomej, wygładzony sprężyną: okno „waży”, gdy się je rzuca.
  const tiltTarget = useTransform(useVelocity(x), [-TILT.velocity, 0, TILT.velocity], [-TILT.degrees, 0, TILT.degrees], {
    clamp: true,
  });
  const tilt = useSpring(tiltTarget, { stiffness: 260, damping: 26 });
  // Okna montują się po hydracji, więc pomiar docka w inicjalizatorze nie psuje zgodności z SSR.
  const [insets, setInsets] = useState(measureInsets);
  const [bounds, setBounds] = useState<DragBounds>({ left: 0, right: 0, top: 0, bottom: 0 });
  const boundsRef = useRef(bounds);
  const reserve = insets.top + insets.bottom + (tabs ? ORNAMENT_PX : 0) + (status ? ORNAMENT_PX : 0);

  // Pozycja: zapamiętana (względna) albo kaskada; po zmianie rozmiaru ekranu – w tym samym miejscu zakresu.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const place = (initial: boolean) => {
      const nextInsets = initial ? insets : measureInsets();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const next = dragBounds({ width: frame.offsetWidth, height: frame.offsetHeight }, viewport, nextInsets);
      const saved = useWindowsStore.getState().positions[id];
      const offset = initial
        ? initialOffset(saved, Math.max(0, windows.stack.indexOf(id)), CASCADE_PX, next)
        : saved
          ? initialOffset(saved, 0, 0, next)
          : clampOffset({ x: x.get(), y: y.get() }, next);
      boundsRef.current = next;
      setBounds(next);
      if (!initial) setInsets(nextInsets);
      x.set(offset.x);
      y.set(offset.y);
    };
    place(true);
    const onResize = () => place(false);
    const observer = new ResizeObserver(onResize);
    observer.observe(frame);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
    // Pozycja startowa liczy się raz, przy otwarciu; potem tylko przy zmianie rozmiaru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePosition = () => {
    useWindowsStore.getState().setPosition(id, toSaved({ x: x.get(), y: y.get() }, boundsRef.current));
  };

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 flex items-center justify-center"
      style={{ zIndex: layer, paddingTop: insets.top, paddingBottom: insets.bottom, paddingInline: insets.side }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: duration.feedback }}
    >
      <motion.div
        ref={frameRef}
        role="dialog"
        aria-modal={isTop}
        aria-labelledby={titleId}
        data-window={id}
        data-testid={`${id}-panel`}
        data-active={isTop || undefined}
        tabIndex={-1}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={bounds}
        dragElastic={0.06}
        dragMomentum={!reduceMotion}
        dragTransition={{ power: 0.22, timeConstant: 240, bounceStiffness: 420, bounceDamping: 34 }}
        onDragTransitionEnd={savePosition}
        onDragEnd={reduceMotion ? savePosition : undefined}
        onPointerDownCapture={() => windows.focus(id)}
        onFocusCapture={() => windows.focus(id)}
        style={{ x, y, rotate: reduceMotion ? 0 : tilt, "--window-reserve": `${reserve}px` }}
        className="window-frame pointer-events-auto relative flex max-w-full flex-col items-center gap-3 outline-none"
      >
        {tabs && (
          <motion.div {...content} className="shrink-0">
            {tabs}
          </motion.div>
        )}
        <div className="window-stage relative">
          {aside && (
            <motion.div {...content} className="window-aside absolute top-1/2 right-full mr-5 -translate-y-1/2">
              <Glass depth="mid" parallax={false} className="rounded-widget p-5">
                {aside}
              </Glass>
            </motion.div>
          )}
          <Glass
            layoutId={layoutId}
            transition={layoutTransition}
            initial={layoutId ? undefined : { opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
            animate={layoutId ? undefined : { opacity: 1, scale: 1 }}
            exit={layoutId ? undefined : { opacity: 0, scale: reduceMotion ? 1 : 0.96, transition: quickExit }}
            depth="near"
            parallax={false}
            className={`flex max-h-[min(calc(100dvh-var(--window-reserve)),calc(var(--u)*46))] flex-col overflow-hidden rounded-window ${WIDTH[size]}`}
          >
            <motion.div className="flex min-h-0 flex-1 flex-col" {...content}>
              <header
                onPointerDown={(event) => startsDrag(event) && dragControls.start(event)}
                className="flex shrink-0 cursor-grab touch-none items-center justify-between gap-3 px-6 pt-5 pb-3 select-none active:cursor-grabbing"
              >
                <h2 id={titleId} className="text-lead font-semibold text-text-primary">
                  {APPS[id].title}
                </h2>
                <CloseButton onClose={() => windows.close(id)} />
              </header>
              {children}
            </motion.div>
          </Glass>
        </div>
        {status && (
          <motion.div {...content} className="shrink-0">
            {status}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Telefon i tablet (< 1024 px): arkusz na pełny ekran, ornamenty w środku, zamknięcie gestem w dół. */
function SheetBody({ id, tabs, status, aside, children }: WindowProps) {
  const { windows, reduceMotion, isTop, titleId, layer, layoutId, layoutTransition, content } = useWindowShell(id);
  const dragControls = useDragControls();

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (shouldDismissSheet(info.offset.y, info.velocity.y, window.innerHeight)) windows.close(id);
  };

  return (
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: layer }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: duration.feedback }}
    >
      <Glass
        layoutId={layoutId}
        transition={layoutTransition}
        initial={layoutId ? undefined : { opacity: 0, y: reduceMotion ? 0 : 48 }}
        animate={layoutId ? undefined : { opacity: 1, y: 0 }}
        exit={layoutId ? undefined : { opacity: 0, y: reduceMotion ? 0 : 48, transition: quickExit }}
        depth="near"
        parallax={false}
        role="dialog"
        aria-modal={isTop}
        aria-labelledby={titleId}
        data-window={id}
        data-testid={`${id}-panel`}
        tabIndex={-1}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.9 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        className="absolute inset-0 flex flex-col overflow-hidden rounded-none border-0"
      >
        <motion.div className="flex min-h-0 flex-1 flex-col" {...content}>
          <header
            onPointerDown={(event) => startsDrag(event) && dragControls.start(event)}
            className="relative flex shrink-0 touch-none flex-col px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 select-none"
          >
            {/* Uchwyt: przeciągnięcie w dół zamyka arkusz. */}
            <span aria-hidden className="mx-auto mb-2 h-1.25 w-10 rounded-full bg-white/30" />
            <div className="flex items-center justify-between gap-3">
              <h2 id={titleId} className="text-lead font-semibold text-text-primary">
                {APPS[id].title}
              </h2>
              <CloseButton onClose={() => windows.close(id)} />
            </div>
            {tabs && <div className="mt-3 flex justify-center">{tabs}</div>}
          </header>
          {children}
          {aside && <section className="shrink-0 border-t border-white/10 px-6 py-4">{aside}</section>}
          {status && (
            <div className="flex shrink-0 justify-center px-6 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">{status}</div>
          )}
        </motion.div>
      </Glass>
    </motion.div>
  );
}

/** Kapsuła statusu pod oknem (ornament): stan danych, źródło, atrybucja. */
export function StatusCapsule({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Glass
      depth="mid"
      parallax={false}
      className={`flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-[calc(var(--u)*1.25)] px-4 py-2 text-center text-caption text-text-secondary sm:rounded-pill ${className ?? ""}`}
    >
      {children}
    </Glass>
  );
}
