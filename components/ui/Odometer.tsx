"use client";

import { useState } from "react";
import { diffDigits, type PriceDirection } from "@/lib/markets/odometer";

interface OdometerProps {
  /** Sformatowana wartość (np. „85 323,09 $”). */
  value: string;
  /** Kierunek ostatniej zmiany: zmienione cyfry przewijają się w górę albo w dół. */
  direction: PriceDirection | null;
  /** Zmiana klucza (waluta, symbol) = nowa wartość bez przewijania. */
  resetKey?: string;
  className?: string;
}

/**
 * Licznik: przy zmianie wartości przewijają się tylko cyfry, które się zmieniły
 * (`diffDigits`), reszta stoi. Animacja w CSS (`styles/markets.css`); przy reduced motion nowa
 * cyfra tylko przenika. Czytnik dostaje całą wartość jednym tekstem.
 */
export function Odometer({ value, direction, resetKey = "", className }: OdometerProps) {
  const [shown, setShown] = useState({ value, resetKey, previous: null as string | null, tick: 0 });
  if (shown.value !== value || shown.resetKey !== resetKey) {
    setShown({ value, resetKey, previous: shown.resetKey === resetKey ? shown.value : null, tick: shown.tick + 1 });
  }
  const cells = diffDigits(shown.previous, value);

  return (
    <span className={`inline-block whitespace-nowrap tabular-nums ${className ?? ""}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {cells.map((cell) =>
          cell.changed ? (
            <span key={cell.key} className="odo-cell">
              {/* Nowy klucz przy każdej zmianie: animacja startuje od początku. */}
              <span key={shown.tick} className="odo-roll" data-dir={direction ?? "up"}>
                <span>{cell.previous ?? " "}</span>
                <span>{cell.char}</span>
              </span>
            </span>
          ) : (
            <span key={cell.key} className={cell.isDigit ? "odo-cell" : undefined}>
              {cell.char}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
