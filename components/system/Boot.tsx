"use client";

import { useEffect, useRef, useState } from "react";
import {
  barProgress,
  BOOT_FIRST,
  BOOT_MARK,
  BOOT_REDUCED,
  BOOT_SIGNALS,
  BOOT_STORAGE_KEY,
  BOOT_WAKE,
  bootSignals,
  getBootState,
  markBootDone,
  onBootSignal,
  parseBootPlan,
  readyTime,
  revealAt,
  setBootState,
  type BootSignal,
} from "@/lib/boot";
import { SMALL_ORB } from "@/lib/orb/geometry";
import { ease } from "@/lib/motion";

const EASE_OUT = `cubic-bezier(${ease.out.join(", ")})`;
const REDUCED_SIGNALS: readonly BootSignal[] = ["poster"];

/**
 * Sekwencja startowa. Logo, wordmark i pasek to animacje CSS, które ruszają od pierwszej
 * klatki (plan ustawia skrypt inline). Tu: realny postęp i bramka, odsłonięcie pulpitu,
 * przelot kul z logo do kuli „Obok”, pominięcie klawiszem/kliknięciem i koniec startu.
 */
export function Boot() {
  const [present, setPresent] = useState(true);
  const fillRef = useRef<HTMLSpanElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const smallRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-boot-live", "");
    if (performance.getEntriesByName(BOOT_MARK.live).length === 0) performance.mark(BOOT_MARK.live);
    if (getBootState().phase === "done") return;

    const plan = parseBootPlan(root.dataset.boot);
    const mark = (name: string) => performance.getEntriesByName(name)[0]?.startTime;
    const startedAt = mark(BOOT_MARK.start) ?? mark(BOOT_MARK.script) ?? performance.now();
    setBootState({ plan, startedAt });

    const timers = new Set<number>();
    const flights: Animation[] = [];
    let frame = 0;
    let offSignal = () => {};
    let revealTimer = 0;

    const at = (time: number, run: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        run();
      }, Math.max(0, time - performance.now()));
      timers.add(id);
    };

    const removeListeners = () => {
      window.removeEventListener("keydown", onSkip, true);
      window.removeEventListener("pointerdown", onSkip, true);
    };

    const stopAll = () => {
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      window.clearTimeout(revealTimer);
      cancelAnimationFrame(frame);
      offSignal();
      removeListeners();
    };

    const finish = (skipped: boolean) => {
      if (getBootState().phase === "done") return;
      stopAll();
      for (const flight of flights) flight.cancel();
      try {
        localStorage.setItem(BOOT_STORAGE_KEY, "1");
      } catch {
        // Bez zapisu kolejna wizyta po prostu znów pokaże pełną sekwencję.
      }
      const clear = () => {
        root.removeAttribute("data-boot");
        root.removeAttribute("data-boot-step");
        root.removeAttribute("data-boot-orb");
      };
      if (skipped && plan !== "off") {
        performance.mark(BOOT_MARK.skip);
        // Stan końcowy przez krótkie przenikanie (150 ms) zamiast przeskoku.
        if (typeof document.startViewTransition === "function" && !document.hidden) {
          root.setAttribute("data-boot-skip", "");
          const transition = document.startViewTransition(clear);
          transition.finished.finally(() => root.removeAttribute("data-boot-skip"));
        } else {
          clear();
        }
      } else {
        clear();
      }
      setBootState({ phase: "done", skipped });
      performance.mark(BOOT_MARK.done);
      markBootDone();
      setPresent(false);
    };

    function onSkip() {
      finish(true);
    }

    if (plan === "off") {
      finish(false);
      return;
    }

    window.addEventListener("keydown", onSkip, true);
    window.addEventListener("pointerdown", onSkip, true);

    const state = getBootState();

    if (plan === "wake") {
      setBootState({ phase: "reveal", revealedAt: startedAt });
      at(startedAt + BOOT_WAKE.end, () => finish(false));
      return stopAll;
    }

    const required = plan === "reduced" ? REDUCED_SIGNALS : BOOT_SIGNALS;
    const gate =
      plan === "reduced"
        ? { gate: 0, maxWait: BOOT_REDUCED.maxWait, settle: 0 }
        : { gate: BOOT_FIRST.gate, maxWait: BOOT_FIRST.maxWait, settle: BOOT_FIRST.barSettle };

    /** Kule z logo lecą na miejsce kuli i małej kuli, rosnąc do ich rozmiaru (FLIP). */
    const fly = (duration: number) => {
      const target = document.querySelector<HTMLElement>('[data-testid="orb"]');
      const big = bigRef.current;
      const small = smallRef.current;
      if (!target || !big || !small) return;
      performance.mark(BOOT_MARK.flight);
      const box = target.getBoundingClientRect();
      const d = box.width;
      const launch = (element: HTMLElement, cx: number, cy: number, size: number) => {
        const from = element.getBoundingClientRect();
        const fromScale = Number.parseFloat(getComputedStyle(element).scale) || 1;
        const dx = cx - (from.left + from.width / 2);
        const dy = cy - (from.top + from.height / 2);
        const toScale = element.offsetWidth > 0 ? size / element.offsetWidth : 1;
        flights.push(
          element.animate(
            [
              { translate: "0px 0px", scale: String(fromScale) },
              { translate: `${dx}px ${dy}px`, scale: String(toScale) },
            ],
            { duration, easing: EASE_OUT, fill: "forwards" },
          ),
        );
      };
      launch(big, box.left + d / 2, box.top + d / 2, d);
      launch(small, box.left + SMALL_ORB.x * d, box.top + SMALL_ORB.y * d, 2 * SMALL_ORB.r * d);
    };

    /** Refleks kody przechodzi po panelach od lewej: opóźnienie z położenia panelu. */
    const placeSweeps = () => {
      const width = window.innerWidth || 1;
      const sweeps = [...document.querySelectorAll<HTMLElement>(".glass-sweep")];
      const lefts = sweeps.map((sweep) => sweep.getBoundingClientRect().left);
      sweeps.forEach((sweep, i) => {
        const ratio = Math.min(1, Math.max(0, (lefts[i] ?? 0) / width));
        sweep.style.setProperty("--sweep-offset", String(Math.round(ratio * 1000) / 1000));
      });
    };

    const afterReveal = (revealed: number) => {
      if (plan === "reduced") {
        at(revealed + BOOT_REDUCED.fade, () => finish(false));
        return;
      }
      const f = BOOT_FIRST;
      const flightAt = revealed + f.scene.at - f.gate;
      const landAt = flightAt + f.scene.duration;
      at(flightAt, () => fly(Math.max(0, landAt - performance.now())));
      at(landAt, () => {
        root.setAttribute("data-boot-orb", "landed");
        performance.mark(BOOT_MARK.landed);
      });
      at(revealed + f.end - f.gate, () => finish(false));
    };

    const reveal = () => {
      if (getBootState().phase !== "hold") return;
      offSignal();
      cancelAnimationFrame(frame);
      const now = performance.now();
      if (fillRef.current) fillRef.current.style.transform = "scaleX(1)";
      if (plan === "first") placeSweeps();
      root.setAttribute("data-boot-step", "reveal");
      performance.mark(BOOT_MARK.reveal);
      setBootState({ phase: "reveal", revealedAt: now });
      afterReveal(now);
    };

    // StrictMode (dev) uruchamia efekt drugi raz: po bramce tylko dokładamy kolejne kroki.
    if (state.phase === "reveal" && state.revealedAt !== null) {
      afterReveal(state.revealedAt);
      return stopAll;
    }

    const schedule = () => {
      const ready = readyTime(bootSignals(), required);
      const revealRel = revealAt(ready === null ? null : ready - startedAt, gate);
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(reveal, Math.max(0, startedAt + revealRel - performance.now()));
    };

    const paint = () => {
      const fill = fillRef.current;
      if (fill) {
        const signals = bootSignals();
        const ready = required.filter((signal) => signals.has(signal)).length;
        fill.style.transform = `scaleX(${barProgress(performance.now() - startedAt, ready, required.length)})`;
      }
      frame = requestAnimationFrame(paint);
    };

    offSignal = onBootSignal(schedule);
    schedule();
    if (plan === "first") frame = requestAnimationFrame(paint);
    return stopAll;
  }, []);

  if (!present) return null;

  return (
    <div className="boot" data-testid="boot" aria-hidden>
      {/* Mała „o” pod dużą: wysuwa się zza niej. Obie mają rozmiar docelowej kuli, a w logo są pomniejszone. */}
      <div ref={smallRef} className="boot-orb boot-orb-small" data-testid="boot-orb-small">
        <div className="orb-shadow absolute inset-0" />
        <div className="orb size-full" />
      </div>
      <div ref={bigRef} className="boot-orb boot-orb-big" data-testid="boot-orb">
        <div className="orb-shadow absolute inset-0" />
        <div className="orb size-full" />
      </div>
      <p className="boot-wordmark">Obok</p>
      <div className="boot-bar">
        <span ref={fillRef} className="boot-bar-fill" />
      </div>
    </div>
  );
}
