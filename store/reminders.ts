"use client";

import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addReminder,
  completeReminder,
  pendingReminders,
  reminderSchema,
  removeReminder,
  snoozeReminder,
  starterReminders,
  type Reminder,
} from "@/lib/reminders/reminders";

interface RemindersState {
  reminders: Reminder[];
  /** Dane startowe wstawiamy tylko raz. */
  seeded: boolean;
  /** Zwraca identyfikator nowego przypomnienia (null przy limicie) – Spotlight cofa po nim dodanie. */
  add: (input: { title: string; at: Date }) => string | null;
  /** Drzemka: nowy termin = teraz + 10 min. */
  snooze: (id: string, now: Date) => void;
  complete: (id: string) => void;
  remove: (id: string) => void;
  seedIfFirstVisit: (now: Date, timeZone: string) => void;
}

export const REMINDERS_STORAGE_KEY = "obok-reminders";

const persistedSchema = z.object({
  reminders: z.array(reminderSchema),
  seeded: z.boolean(),
});

type PersistedReminders = z.infer<typeof persistedSchema>;

export const useRemindersStore = create<RemindersState>()(
  persist(
    (set, get) => ({
      reminders: [],
      seeded: false,
      add: (input) => {
        const id = `rem-${crypto.randomUUID()}`;
        const reminders = addReminder(get().reminders, input, id);
        set({ reminders });
        return reminders.some((reminder) => reminder.id === id) ? id : null;
      },
      snooze: (id, now) => set({ reminders: snoozeReminder(get().reminders, id, now) }),
      complete: (id) => set({ reminders: completeReminder(get().reminders, id) }),
      remove: (id) => set({ reminders: removeReminder(get().reminders, id) }),
      seedIfFirstVisit: (now, timeZone) => {
        if (!get().seeded) set({ reminders: starterReminders(now, timeZone), seeded: true });
      },
    }),
    {
      name: REMINDERS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ reminders, seeded }): PersistedReminders => ({ reminders, seeded }),
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      skipHydration: true,
    },
  ),
);

/** Kiedy zegar ma „zbudzić się” poza zwykłym tykaniem: termin najbliższego przypomnienia w przyszłości. */
export function nextWakeAt(nowMs: number): number | null {
  const upcoming = pendingReminders(useRemindersStore.getState().reminders)
    .map((r) => Date.parse(r.at))
    .find((at) => at > nowMs);
  return upcoming ?? null;
}
