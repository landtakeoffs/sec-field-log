import { db } from "./db";
import {
  MAX_HOURS_PER_ENTRY,
  SEVERITIES,
  normalizeHours,
  normalizeWorkDate,
  type Entry,
  type NewEntry,
  type Severity,
} from "./entry-types";

// Entries logged before hours tracking fall back to the date they were created.
const WORK_DATE_EXPR = "COALESCE(NULLIF(work_date, ''), substr(created_at, 1, 10))";

export function listEntries(): Entry[] {
  return db
    .prepare(
      `SELECT * FROM entries ORDER BY ${WORK_DATE_EXPR} DESC, datetime(created_at) DESC, id DESC`,
    )
    .all() as Entry[];
}

/** Entries whose work date falls within `start`..`end` inclusive, oldest first. */
export function listEntriesInRange(start: string, end: string): Entry[] {
  return db
    .prepare(
      `SELECT * FROM entries
       WHERE ${WORK_DATE_EXPR} BETWEEN ? AND ?
       ORDER BY ${WORK_DATE_EXPR} ASC, worker COLLATE NOCASE ASC, id ASC`,
    )
    .all(start, end) as Entry[];
}

export function createEntry(input: NewEntry): Entry {
  const title = input.title.trim();
  if (!title) {
    throw new Error("title is required");
  }

  const hours = normalizeHours(input.hours);
  if (hours === null) {
    throw new Error(`hours must be a number between 0 and ${MAX_HOURS_PER_ENTRY}`);
  }

  const workDate = normalizeWorkDate(input.work_date);
  if (workDate === null) {
    throw new Error("work_date must be a YYYY-MM-DD date");
  }

  const severity: Severity = SEVERITIES.includes(input.severity as Severity)
    ? (input.severity as Severity)
    : "low";

  const result = db
    .prepare(
      `INSERT INTO entries (title, worker, work_date, hours, location, severity, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      (input.worker ?? "").trim(),
      workDate,
      hours,
      (input.location ?? "").trim(),
      severity,
      (input.notes ?? "").trim(),
    );

  return db
    .prepare("SELECT * FROM entries WHERE id = ?")
    .get(result.lastInsertRowid) as Entry;
}
