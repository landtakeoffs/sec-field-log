import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

// Persist the SQLite database under ./data so it survives dev-server reloads.
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "field-log.db");

// Reuse a single connection across hot reloads in development.
const globalForDb = globalThis as unknown as { __fieldLogDb?: Database.Database };

export const db =
  globalForDb.__fieldLogDb ?? new Database(dbPath);

// Columns added after the first release; databases created before hours
// tracking existed are upgraded in place on the next boot.
const ADDED_COLUMNS: Record<string, string> = {
  worker: "ALTER TABLE entries ADD COLUMN worker TEXT NOT NULL DEFAULT ''",
  work_date: "ALTER TABLE entries ADD COLUMN work_date TEXT NOT NULL DEFAULT ''",
  hours: "ALTER TABLE entries ADD COLUMN hours REAL NOT NULL DEFAULT 0",
};

if (!globalForDb.__fieldLogDb) {
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
}
