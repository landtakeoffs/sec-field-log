import { Pool, type PoolClient } from "pg";

/**
 * Single shared Postgres pool for all serverless invocations.
 * Vercel warm-starts reuse the module scope, so the pool sticks around.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    throw new Error("No Postgres connection string set (DATABASE_URL / POSTGRES_URL).");
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
}

let initialized = false;
export async function ensureSchema(client: PoolClient): Promise<void> {
  if (initialized) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      week_of DATE NOT NULL,
      operator TEXT NOT NULL,
      hours JSONB NOT NULL,
      inspections JSONB NOT NULL,
      readings_count INT NOT NULL DEFAULT 0,
      inspections_count INT NOT NULL DEFAULT 0,
      bad_items_count INT NOT NULL DEFAULT 0,
      raw JSONB
    );
    CREATE INDEX IF NOT EXISTS submissions_week_idx ON submissions(week_of);
    CREATE INDEX IF NOT EXISTS submissions_operator_idx ON submissions(operator);
  `);
  initialized = true;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await ensureSchema(client);
    return await fn(client);
  } finally {
    client.release();
  }
}
