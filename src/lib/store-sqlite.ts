import { WORK_DATE_SQL, type EntryStore } from "./entry-store";
import {
  MAX_HOURS_PER_ENTRY,
  SEVERITIES,
  normalizeHours,
  normalizeWorkDate,
  type Entry,
  type NewEntry,
  type Severity,
} from "./entry-types";

// Columns added after the first release; databases created before hours
// tracking existed are upgraded in place on the next boot.
const ADDED_COLUMNS: Record<string, string> = {
  worker: "ALTER TABLE entries ADD COLUMN worker TEXT NOT NULL DEFAULT ''",
  work_date: "ALTER TABLE entries ADD COLUMN work_date TEXT NOT NULL DEFAULT ''",
  hours: "ALTER TABLE entries ADD COLUMN hours REAL NOT NULL DEFAULT 0",
};

type SqliteDatabase = import("better-sqlite3").Database;

const globalForDb = globalThis as unknown as { __fieldLogDb?: SqliteDatabase };

async function connect(): Promise<SqliteDatabase> {
  if (globalForDb.__fieldLogDb) {
    return globalForDb.__fieldLogDb;
  }

  // Imported lazily and natively so the module is never loaded when a deployed
  // app is using Postgres instead.
  const [{ default: Database }, path, fs] = await Promise.all([
    import("better-sqlite3"),
    import("node:path"),
    import("node:fs"),
  ]);

  // Persist the SQLite database under ./data so it survives dev-server reloads.
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(path.join(dataDir, "field-log.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      worker TEXT NOT NULL DEFAULT '',
      work_date TEXT NOT NULL DEFAULT '',
      hours REAL NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'low',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(entries)").all() as { name: string }[]).map(
      (column) => column.name,
    ),
  );
  for (const [column, statement] of Object.entries(ADDED_COLUMNS)) {
    if (!existingColumns.has(column)) {
      db.exec(statement);
    }
  }

  db.exec(
    "CREATE INDEX IF NOT EXISTS entries_work_date_idx ON entries (work_date, worker);",
  );

  globalForDb.__fieldLogDb = db;
  return db;
}

export const sqliteStore: EntryStore = {
  name: "sqlite",

  async listEntries() {
    const db = await connect();
    return db
      .prepare(
        `SELECT * FROM entries ORDER BY ${WORK_DATE_SQL} DESC, datetime(created_at) DESC, id DESC`,
      )
      .all() as Entry[];
  },

  async listEntriesInRange(start, end) {
    const db = await connect();
    return db
      .prepare(
        `SELECT * FROM entries
         WHERE ${WORK_DATE_SQL} BETWEEN ? AND ?
         ORDER BY ${WORK_DATE_SQL} ASC, worker COLLATE NOCASE ASC, id ASC`,
      )
      .all(start, end) as Entry[];
  },

  async createEntry(input: NewEntry) {
    const db = await connect();

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
  },
};
