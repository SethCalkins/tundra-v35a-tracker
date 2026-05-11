/**
 * D1 (SQLite) client for the dashboard, running on Cloudflare Workers.
 *
 * Server-only. Never import this from a client component.
 *
 * Local dev uses `wrangler dev`, which provides an emulated D1 binding
 * backed by a local SQLite file (see .wrangler/state/). Production uses
 * the real D1 binding declared in wrangler.toml.
 */
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function db(): D1Database {
  const { env } = getCloudflareContext();
  const binding = (env as Cloudflare.Env).DB;
  if (!binding) {
    throw new Error(
      "D1 binding 'DB' is not available. Check wrangler.toml and run via wrangler dev.",
    );
  }
  return binding;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const stmt = db().prepare(sql).bind(...(params as unknown[]));
  const result = await stmt.all<T>();
  return (result.results ?? []) as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T | null> {
  const stmt = db().prepare(sql).bind(...(params as unknown[]));
  const row = await stmt.first<T>();
  return row ?? null;
}

// ── Helpers for stats SQLite can't do natively ──────────────────────────

/** Linear-interpolated percentile over a numeric array. Returns null if empty. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** D1 stores booleans as 0/1 integers. Normalize to JS boolean | null. */
export function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Number(v) === 1;
}
