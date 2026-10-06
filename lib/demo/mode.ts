/** Tryb demo (`?demo=1`): automatyczna wycieczka po pulpicie dla rekruterów i klientów. */
export const DEMO_PARAM = "demo";

export function isDemoValue(value: string | string[] | null | undefined): boolean {
  return value === "1";
}

export function isDemoSearch(search: string): boolean {
  return isDemoValue(new URLSearchParams(search).get(DEMO_PARAM));
}
