import type { Entry, NewEntry } from "./entry-types";

/**
 * Where entries live. Vercel's filesystem is read-only, so a deployed app must
 * use Postgres; local development falls back to the SQLite file.
 */
export interface EntryStore {
  readonly name: "postgres" | "sqlite";
  listEntries(): Promise<Entry[]>;
  listEntriesInRange(start: string, end: string): Promise<Entry[]>;
  createEntry(input: NewEntry): Promise<Entry>;
}

// Entries logged before hours tracking fall back to the date they were created.
export const WORK_DATE_SQL = "COALESCE(NULLIF(work_date, ''), substr(created_at, 1, 10))";

export function postgresUrl(): string | undefined {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  return url?.trim() ? url.trim() : undefined;
}

export function storeName(): EntryStore["name"] {
  return postgresUrl() ? "postgres" : "sqlite";
}
