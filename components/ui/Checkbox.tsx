"use client";

import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  /** Nazwa dla czytników ekranu (pole nie ma widocznej etykiety). */
  "aria-label": string;
};

/**
 * Pole wyboru: natywny `<input>` (klawiatura, formularze, czytniki ekranu) pod okrągłą atrapą
 * w bursztynie. Stan rysuje CSS (`peer-checked`), więc nie ma własnej logiki.
 */
export function Checkbox(props: CheckboxProps) {
  return (
    <span className="relative inline-grid size-7 shrink-0 place-items-center">
      <input type="checkbox" {...props} className="peer absolute inset-0 size-full cursor-pointer opacity-0" />
      <span
        aria-hidden
        className="pointer-events-none grid size-5.5 place-items-center rounded-full border border-white/45 text-[rgb(20_14_8)] transition-[background-color,border-color] duration-(--dur-feedback) ease-out peer-checked:border-amber peer-checked:bg-amber peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100"
      >
        <Check
          className="size-3.5 scale-50 opacity-0 transition-[scale,opacity] duration-(--dur-feedback) ease-out motion-reduce:transition-none"
          strokeWidth={3}
        />
      </span>
    </span>
  );
}
