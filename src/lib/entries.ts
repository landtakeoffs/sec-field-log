import { db } from "./db";
import { SEVERITIES, type Entry, type NewEntry, type Severity } from "./entry-types";

export function listEntries(): Entry[] {
  return db
    .prepare("SELECT * FROM entries ORDER BY datetime(created_at) DESC, id DESC")
    .all() as Entry[];
}

export function createEntry(input: NewEntry): Entry {
  const title = input.title.trim();
  if (!title) {
    throw new Error("title is required");
  }

  const severity: Severity = SEVERITIES.includes(input.severity as Severity)
    ? (input.severity as Severity)
    : "low";

  const result = db
    .prepare(
      "INSERT INTO entries (title, location, severity, notes) VALUES (?, ?, ?, ?)",
    )
    .run(title, (input.location ?? "").trim(), severity, (input.notes ?? "").trim());

  return db
    .prepare("SELECT * FROM entries WHERE id = ?")
    .get(result.lastInsertRowid) as Entry;
}
