import { isValidDateString } from "./dates";

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const MAX_HOURS_PER_ENTRY = 24;

export interface Entry {
  id: number;
  title: string;
  worker: string;
  work_date: string;
  hours: number;
  location: string;
  severity: Severity;
  notes: string;
  created_at: string;
}

export interface NewEntry {
  title: string;
  worker?: string;
  work_date?: string;
  hours?: number | string;
  location?: string;
  severity?: Severity;
  notes?: string;
}

/**
 * Entries logged before hours tracking existed have an empty work_date, so the
 * date the entry was created stands in as the date the work happened.
 */
export function effectiveWorkDate(entry: Entry): string {
  return entry.work_date || entry.created_at.slice(0, 10);
}

/** Returns the rounded hours, or `null` when the input is not a usable number. */
export function normalizeHours(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > MAX_HOURS_PER_ENTRY) {
    return null;
  }
  return Math.round(hours * 100) / 100;
}

/** Returns a `YYYY-MM-DD` date, `""` when absent, or `null` when unusable. */
export function normalizeWorkDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return isValidDateString(value) ? value : null;
}
