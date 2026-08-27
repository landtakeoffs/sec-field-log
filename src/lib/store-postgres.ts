import { Pool } from "pg";
import { WORK_DATE_SQL, postgresUrl, type EntryStore } from "./entry-store";
import {
  MAX_HOURS_PER_ENTRY,
  SEVERITIES,
  normalizeHours,
  normalizeWorkDate,
  type Entry,
  type NewEntry,
  type Severity,
} from "./entry-types";

const globalForPg = globalThis as unknown as {
  __fieldLogPool?: Pool;
  __fieldLogSchema?: Promise<void>;
};

function isLocalHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function pool(): Pool {
  if (globalForPg.__fieldLogPool) {
    return globalForPg.__fieldLogPool;
  }
  const connectionString = postgresUrl();
  if (!connectionString) {
    throw new Error("POSTGRES_URL (or DATABASE_URL) is not set");
  }
  // Serverless invocations are short-lived, so keep the pool small. Managed
  // providers use publicly trusted certificates; local Postgres has none.
  const created = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    ssl: isLocalHost(connectionString) ? false : { rejectUnauthorized: true },
  });
  globalForPg.__fieldLogPool = created;
  return created;
}

/** `created_at` is stored as a UTC string so both backends format it alike. */
const CREATED_AT_DEFAULT = "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')";

function ensureSchema(): Promise<void> {
  globalForPg.__fieldLogSchema ??= (async () => {
    await pool().query(`
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        worker TEXT NOT NULL DEFAULT '',
        work_date TEXT NOT NULL DEFAULT '',
        hours DOUBLE PRECISION NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'low',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ${CREATED_AT_DEFAULT}
      );
    `);
    await pool().query(
      "CREATE INDEX IF NOT EXISTS entries_work_date_idx ON entries (work_date, worker);",
    );
  })();
  return globalForPg.__fieldLogSchema;
}

interface EntryRow extends Omit<Entry, "hours"> {
  hours: number | string;
}

function toEntry(row: EntryRow): Entry {
  return { ...row, hours: Number(row.hours) };
}

export const postgresStore: EntryStore = {
  name: "postgres",

  async listEntries() {
    await ensureSchema();
    const { rows } = await pool().query<EntryRow>(
      `SELECT * FROM entries ORDER BY ${WORK_DATE_SQL} DESC, created_at DESC, id DESC`,
    );
    return rows.map(toEntry);
  },

  async listEntriesInRange(start, end) {
    await ensureSchema();
    const { rows } = await pool().query<EntryRow>(
      `SELECT * FROM entries
       WHERE ${WORK_DATE_SQL} BETWEEN $1 AND $2
       ORDER BY ${WORK_DATE_SQL} ASC, lower(worker) ASC, id ASC`,
      [start, end],
    );
    return rows.map(toEntry);
  },

  async createEntry(input: NewEntry) {
    await ensureSchema();

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

    const { rows } = await pool().query<EntryRow>(
      `INSERT INTO entries (title, worker, work_date, hours, location, severity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        title,
        (input.worker ?? "").trim(),
        workDate,
        hours,
        (input.location ?? "").trim(),
        severity,
        (input.notes ?? "").trim(),
      ],
    );
    return toEntry(rows[0]);
  },
};
