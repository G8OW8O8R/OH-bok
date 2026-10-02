"use client";

import { CalendarDays, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { PanelFooter, PanelScroll, WidgetPanel } from "@/components/ui/WidgetPanel";
import { duration, ease, spring, transitionFor } from "@/lib/motion";
import { clampSlot, presetAt, QUICK_PRESETS, type CustomSlot, type PresetId } from "@/lib/reminders/presets";
import {
  defaultReminderInput,
  MAX_TITLE,
  parseReminderInput,
  pendingReminders,
  type Reminder,
} from "@/lib/reminders/reminders";
import { dateIn, formatCountdown, formatDue, formatWhen, minutesUntil, zonedDate } from "@/lib/time";
import { REMINDERS_LAYOUT_ID } from "./Reminders";

interface RemindersPanelProps {
  open: boolean;
  onClose: () => void;
  reminders: Reminder[];
  now: Date;
  timeZone: string;
  onAdd: (input: { title: string; at: Date }) => void;
  onRemove: (id: string) => void;
}

export function RemindersPanel({ open, onClose, ...editor }: RemindersPanelProps) {
  return (
    <WidgetPanel open={open} onClose={onClose} layoutId={REMINDERS_LAYOUT_ID} id="reminders" title="Przypomnienia" wide>
      <RemindersEditor {...editor} />
    </WidgetPanel>
  );
}

/** Termin: szybki wybór (liczony w chwili dodania) albo własna data i godzina. */
type When = { kind: "preset"; id: PresetId } | { kind: "custom" };

const PICKER_ID = "reminder-picker";

const chip = (active: boolean) =>
  `flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-caption transition-[background-color,color,scale] duration-(--dur-feedback) ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
    active ? "bg-amber/15 font-medium text-amber ring-1 ring-amber/70 ring-inset" : "bg-white/10 text-text-primary hover:bg-white/15"
  }`;

function RemindersEditor({ reminders, now, timeZone, onAdd, onRemove }: Omit<RemindersPanelProps, "open" | "onClose">) {
  const reduceMotion = useReducedMotion();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<When>({ kind: "preset", id: "1h" });
  const [custom, setCustom] = useState<CustomSlot>(() => defaultReminderInput(now, timeZone));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const resolveAt = (from: Date) =>
    when.kind === "preset" ? presetAt(when.id, from, timeZone) : zonedDate(custom.date, custom.time, timeZone);
  const due = resolveAt(now);

  const chooseCustom = (slot: CustomSlot) => {
    setCustom(clampSlot(slot, new Date(), timeZone));
    setWhen({ kind: "custom" });
    setError(null);
  };

  const togglePicker = () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    chooseCustom(custom);
    setPickerOpen(true);
  };

  // Esc w wyborze terminu zwija tylko kalendarz; panel zamyka dopiero kolejne Esc.
  const onWhenKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.key !== "Escape" || !pickerOpen) return;
    event.preventDefault();
    setPickerOpen(false);
    toggleRef.current?.focus();
  };

  // Rozwinięty kalendarz musi się zmieścić w widoku przewijanej części panelu.
  const revealPicker = () => {
    const picker = document.getElementById(PICKER_ID);
    const scroller = picker?.closest<HTMLElement>("[data-panel-scroll]");
    if (!picker || !scroller) return;
    const overflow = picker.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
    if (overflow > 0) scroller.scrollBy({ top: overflow + 8, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const submittedAt = new Date();
    const parsed = parseReminderInput({ title, at: resolveAt(submittedAt) }, submittedAt);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onAdd({ title: parsed.title, at: parsed.at });
    setTitle("");
    setError(null);
  };

  const pending = pendingReminders(reminders);
  const finished = reminders.filter((r) => r.done);
  const transition = transitionFor(reduceMotion, spring.default);
  const dueLabel = formatDue(due, now, timeZone);

  return (
    <form id="reminder-form" onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <PanelScroll className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <input
            data-autofocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={MAX_TITLE}
            autoComplete="off"
            aria-label="O czym przypomnieć"
            aria-invalid={error !== null}
            aria-describedby={error ? "reminder-error" : undefined}
            placeholder="O czym przypomnieć…"
            className="field w-full text-body"
          />

          <fieldset onKeyDown={onWhenKeyDown}>
            <legend className="sr-only">Termin</legend>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((preset) => {
                const active = when.kind === "preset" && when.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setWhen({ kind: "preset", id: preset.id });
                      setPickerOpen(false);
                      setError(null);
                    }}
                    className={chip(active)}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                ref={toggleRef}
                type="button"
                aria-expanded={pickerOpen}
                aria-controls={PICKER_ID}
                onClick={togglePicker}
                className={chip(when.kind === "custom")}
              >
                <CalendarDays aria-hidden className="size-3.5" strokeWidth={2} />
                {when.kind === "custom" ? capitalize(dueLabel) : "Inna data"}
              </button>
            </div>

            {/* Panel zmienia wysokość płynnie: rośnie/maleje sama sekcja kalendarza. */}
            <AnimatePresence initial={false}>
              {pickerOpen && (
                <motion.div
                  id={PICKER_ID}
                  key="picker"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={transitionFor(reduceMotion, { duration: duration.feedback + 0.06, ease: ease.out })}
                  onAnimationComplete={() => {
                    if (pickerOpen) revealPicker();
                  }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 px-0.5 pt-4 pb-0.5">
                    <div className="w-[max(16rem,calc(var(--u)*17))] max-w-full">
                      <DatePicker
                        id="reminder-date"
                        value={custom.date}
                        today={dateIn(now, timeZone)}
                        onChange={(date) => chooseCustom({ ...custom, date })}
                      />
                    </div>
                    <TimePicker value={custom.time} onChange={(time) => chooseCustom({ ...custom, time })} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </fieldset>
        </div>

        {reminders.length === 0 && <p className="text-body text-text-secondary">Nic nie czeka. Dodaj pierwsze przypomnienie.</p>}

        <Group label="Nadchodzące" reminders={pending} now={now} timeZone={timeZone} transition={transition} onRemove={onRemove} />
        {finished.length > 0 && (
          <Group label="Zakończone" reminders={finished} now={now} timeZone={timeZone} transition={transition} onRemove={onRemove} muted />
        )}
      </PanelScroll>

      <PanelFooter>
        <div className="min-w-0 flex-1 text-caption">
          <p id="reminder-error" role="alert" className="text-amber empty:hidden">
            {error}
          </p>
          {!error && (
            <p className="truncate text-text-secondary">
              Termin: <span className="text-text-primary tabular-nums" data-testid="reminder-due">{dueLabel}</span>
            </p>
          )}
        </div>
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-pill bg-amber px-4 py-2.5 text-body font-medium text-[rgb(20_14_8)] transition-[scale] duration-(--dur-feedback) ease-out hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2.5} />
          Dodaj
        </button>
      </PanelFooter>
    </form>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface GroupProps {
  label: string;
  reminders: Reminder[];
  now: Date;
  timeZone: string;
  transition: ReturnType<typeof transitionFor>;
  onRemove: (id: string) => void;
  muted?: boolean;
}

function Group({ label, reminders, now, timeZone, transition, onRemove, muted }: GroupProps) {
  if (reminders.length === 0) return null;
  return (
    <section aria-label={label}>
      <h3 className="mb-1 text-caption tracking-wide text-text-secondary uppercase">{label}</h3>
      <ul className="flex flex-col">
        <AnimatePresence initial={false} mode="popLayout">
          {reminders.map((reminder) => {
            const at = new Date(reminder.at);
            const overdue = !muted && at.getTime() <= now.getTime();
            return (
              <motion.li
                key={reminder.id}
                layout="position"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={transition}
                className="flex items-center gap-3 py-1.5"
              >
                <span className={`size-2.5 shrink-0 rounded-full ${overdue ? "bg-amber" : "bg-white/45"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-body ${muted ? "text-text-secondary line-through decoration-white/40" : "text-text-primary"}`}>
                    {reminder.title}
                  </span>
                  <span className={`block text-caption tabular-nums ${overdue ? "text-amber" : "text-text-secondary"}`}>
                    <time dateTime={reminder.at}>{formatWhen(at, now, timeZone)}</time>
                    {overdue && ` · ${formatCountdown(minutesUntil(at, now)).toLowerCase()}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(reminder.id)}
                  aria-label={`Usuń: ${reminder.title}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-text-tertiary transition-colors duration-(--dur-feedback) hover:bg-white/10 hover:text-text-primary"
                >
                  <X aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
