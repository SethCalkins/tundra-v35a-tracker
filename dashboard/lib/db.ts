/**
 * Postgres client for the dashboard.
 *
 * Server-only. Never import this from a client component.
 * Connection-pooled — module-level pool reused across Route Handlers and RSCs.
 */
import "server-only";
import { Pool, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Symlink ../.env to dashboard/.env.local or export it explicitly.",
    );
  }
  return new Pool({ connectionString: url, max: 5 });
}

const pool = globalThis.__pgPool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
