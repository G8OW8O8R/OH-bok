"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { KeyboardEvent } from "react";
import { joinTime, MINUTE_STEP, splitTime, stepValue } from "@/lib/reminders/presets";

interface TimePickerProps {
  /** `HH:MM` */
  value: string;
  onChange: (time: string) => void;
}

/** Godzina i minuty (co 5 min) jako dwa pola `spinbutton` z przyciskami ±. */
export function TimePicker({ value, onChange }: TimePickerProps) {
  const { hour, minute } = splitTime(value);
  return (
    <div role="group" aria-label="Wybór godziny" className="flex items-center gap-1" data-testid="time-picker">
      <Spin label="Godzina" unit="godzinę" value={hour} step={1} max={23} page={3} onChange={(h) => onChange(joinTime(h, minute))} />
      <span aria-hidden className="pb-0.5 text-ring font-light text-text-secondary">
        :
      </span>
      <Spin
        label="Minuty"
        unit={`${MINUTE_STEP} min`}
        value={minute}
        step={MINUTE_STEP}
        max={60 - MINUTE_STEP}
        page={3}
        onChange={(m) => onChange(joinTime(hour, m))}
      />
    </div>
  );
}

interface SpinProps {
  label: string;
  /** „o godzinę” / „o 5 min” w etykietach przycisków. */
  unit: string;
  value: number;
  step: number;
  max: number;
  /** Ile kroków na PageUp/PageDown. */
  page: number;
  onChange: (value: number) => void;
}

const stepButton =
  "grid h-[max(1.75rem,calc(var(--u)*1.6))] w-full place-items-center rounded-full text-text-secondary transition-[background-color,color,scale] duration-(--dur-feedback) ease-out hover:bg-white/10 hover:text-text-primary active:scale-90";

/** Wzorzec APG „spinbutton”: strzałki ±krok, PageUp/PageDown ±kilka kroków, Home/End – skraje. */
function Spin({ label, unit, value, step, max, page, onChange }: SpinProps) {
  const by = (steps: number) => onChange(stepValue(value, steps, step, max));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const actions: Record<string, () => void> = {
      ArrowUp: () => by(1),
      ArrowDown: () => by(-1),
      PageUp: () => by(page),
      PageDown: () => by(-page),
      Home: () => onChange(0),
      End: () => onChange(max),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const text = String(value).padStart(2, "0");
  return (
    <div className="flex w-[max(3.5rem,calc(var(--u)*3.4))] flex-col items-center rounded-pill bg-white/6 py-1">
      {/* Przyciski poza kolejnością Tab: klawiaturą steruje samo pole (strzałki). */}
      <button type="button" tabIndex={-1} aria-label={`${label}: później o ${unit}`} onClick={() => by(1)} className={stepButton}>
        <ChevronUp aria-hidden className="size-4" strokeWidth={2} />
      </button>
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={text}
        onKeyDown={onKeyDown}
        className="w-full rounded-pill py-0.5 text-center text-ring font-light tracking-tight text-text-primary tabular-nums focus-visible:outline-2 focus-visible:outline-amber"
      >
        {text}
      </div>
      <button type="button" tabIndex={-1} aria-label={`${label}: wcześniej o ${unit}`} onClick={() => by(-1)} className={stepButton}>
        <ChevronDown aria-hidden className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
