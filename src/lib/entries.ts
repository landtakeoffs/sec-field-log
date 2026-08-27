import { postgresUrl, storeName, type EntryStore } from "./entry-store";
import type { Entry, NewEntry } from "./entry-types";

async function store(): Promise<EntryStore> {
  if (postgresUrl()) {
    const { postgresStore } = await import("./store-postgres");
    return postgresStore;
  }
  const { sqliteStore } = await import("./store-sqlite");
  return sqliteStore;
}

export { storeName };

export async function listEntries(): Promise<Entry[]> {
  return (await store()).listEntries();
}

/** Entries whose work date falls within `start`..`end` inclusive, oldest first. */
export async function listEntriesInRange(start: string, end: string): Promise<Entry[]> {
  return (await store()).listEntriesInRange(start, end);
}

export async function createEntry(input: NewEntry): Promise<Entry> {
  return (await store()).createEntry(input);
}
