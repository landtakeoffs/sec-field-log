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

if (!globalForDb.__fieldLogDb) {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'low',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  globalForDb.__fieldLogDb = db;
}
