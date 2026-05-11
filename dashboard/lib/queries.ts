/**
 * Typed read queries for the dashboard. Server-only — never import from a
 * client component.
 *
 * D1 (SQLite) translation notes:
 *   - Postgres DISTINCT ON  → ROW_NUMBER() OVER (PARTITION BY ...) = 1
 *   - percentile_cont       → computed in JS via percentile() helper
 *   - FILTER (WHERE ...)    → SUM(CASE WHEN ... THEN 1 ELSE 0 END)
 *   - ILIKE                 → LIKE (SQLite LIKE is case-insensitive for ASCII)
 *   - x::text / x::int      → dropped; D1 returns native JS types
 *   - LATERAL               → correlated subquery or window function
 *   - LEFT(col, n)          → substr(col, 1, n)
 *   - is_hybrid = TRUE      → is_hybrid = 1
 *   - NULLS LAST            → ORDER BY col IS NULL, col
 *   - $1, $2 placeholders   → ?, ?
 *
 * Booleans are stored as INTEGER 0/1; toBool() normalizes for consumers.
 */
import "server-only";
import { query, queryOne, percentile, toBool } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────

export interface Vehicle {
  vin: string;
  model_year: number | null;
  trim: string | null;
  body_style: string | null;
  drivetrain: string | null;
  engine_code: string | null;
  is_hybrid: boolean | null;
  exterior_color: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface VehicleWithListing extends Vehicle {
  mileage: number | null;
  asking_price_usd: number | null;
  listing_url: string | null;
  observed_at: string | null;
  days_since_last_seen: number;
  is_currently_listed: boolean;
  recall_24v381: string | null;
  recall_25v767: string | null;
}

export interface OverviewCounts {
  vehicles: number;
  recall_eligible: number;
  v35a_hybrid: number;
  v35a_nonhybrid: number;
  total_observations: number;
  recall_status_rows: number;
  status_events: number;
  median_mileage_3rdgen: number | null;
}

export interface RecallBreakdown {
  recall_id: string;
  status: string;
  count: number;
}

export interface YearMileageBucket {
  model_year: number;
  is_hybrid: boolean | null;
  count: number;
  median_mileage: number | null;
  p25_mileage: number | null;
  p75_mileage: number | null;
  median_price_usd: number | null;
}

export interface RecallTimeline {
  day: string;
  recall_id: string;
  new_status: string;
  count: number;
}

// ── Queries ───────────────────────────────────────────────────────────────

export async function getOverviewCounts(): Promise<OverviewCounts> {
  // Scalar counts in one round trip.
  const row = await queryOne<{
    vehicles: number;
    recall_eligible: number;
    v35a_hybrid: number;
    v35a_nonhybrid: number;
    total_observations: number;
    recall_status_rows: number;
    status_events: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM vehicles)                                                       AS vehicles,
      (SELECT COUNT(*) FROM vehicles
        WHERE engine_code LIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024)                AS recall_eligible,
      (SELECT COUNT(*) FROM vehicles
        WHERE engine_code LIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024
          AND is_hybrid = 1)                                                                 AS v35a_hybrid,
      (SELECT COUNT(*) FROM vehicles
        WHERE engine_code LIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024
          AND is_hybrid = 0)                                                                 AS v35a_nonhybrid,
      (SELECT COUNT(*) FROM listing_observations)                                            AS total_observations,
      (SELECT COUNT(*) FROM recall_status)                                                   AS recall_status_rows,
      (SELECT COUNT(*) FROM recall_status_events)                                            AS status_events
  `);

  // Median 3rd-gen mileage — fetch latest-per-vin and compute in JS.
  const latestMileage = await query<{ mileage: number }>(`
    SELECT mileage FROM (
      SELECT lo.mileage,
             ROW_NUMBER() OVER (PARTITION BY lo.vin ORDER BY lo.observed_at DESC) AS rn
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
       WHERE v.model_year >= 2022 AND lo.mileage IS NOT NULL
    ) t WHERE rn = 1
  `);
  const med = percentile(latestMileage.map((r) => r.mileage), 0.5);

  if (!row) {
    return {
      vehicles: 0, recall_eligible: 0, v35a_hybrid: 0, v35a_nonhybrid: 0,
      total_observations: 0, recall_status_rows: 0, status_events: 0,
      median_mileage_3rdgen: null,
    };
  }
  return {
    vehicles: row.vehicles,
    recall_eligible: row.recall_eligible,
    v35a_hybrid: row.v35a_hybrid,
    v35a_nonhybrid: row.v35a_nonhybrid,
    total_observations: row.total_observations,
    recall_status_rows: row.recall_status_rows,
    status_events: row.status_events,
    median_mileage_3rdgen: med !== null ? Math.round(med) : null,
  };
}

export async function getRecallBreakdown(): Promise<RecallBreakdown[]> {
  return query<RecallBreakdown>(
    `SELECT recall_id, status, COUNT(*) AS count
       FROM recall_status
      GROUP BY recall_id, status
      ORDER BY recall_id, status`,
  );
}

export async function getYearMileageBuckets(): Promise<YearMileageBucket[]> {
  // Latest mileage + price per VIN, grouped by (year, hybrid).
  const rows = await query<{
    model_year: number;
    is_hybrid: number | null;
    mileage: number | null;
    asking_price_usd: number | null;
  }>(`
    SELECT model_year, is_hybrid, mileage, asking_price_usd
      FROM (
        SELECT v.model_year, v.is_hybrid, lo.mileage, lo.asking_price_usd,
               ROW_NUMBER() OVER (PARTITION BY lo.vin ORDER BY lo.observed_at DESC) AS rn
          FROM listing_observations lo
          JOIN vehicles v ON v.vin = lo.vin
         WHERE v.model_year IS NOT NULL
      ) t WHERE rn = 1
  `);

  // Bucket by (year, hybrid) in JS so we can compute percentiles natively.
  const buckets = new Map<
    string,
    { model_year: number; is_hybrid: boolean | null; mileages: number[]; prices: number[] }
  >();
  for (const r of rows) {
    const hybrid = toBool(r.is_hybrid);
    const key = `${r.model_year}|${hybrid === null ? "n" : hybrid ? "y" : "x"}`;
    let b = buckets.get(key);
    if (!b) {
      b = { model_year: r.model_year, is_hybrid: hybrid, mileages: [], prices: [] };
      buckets.set(key, b);
    }
    if (r.mileage !== null) b.mileages.push(r.mileage);
    if (r.asking_price_usd !== null) b.prices.push(r.asking_price_usd);
  }
  return [...buckets.values()]
    .map((b) => {
      const med = percentile(b.mileages, 0.5);
      const p25 = percentile(b.mileages, 0.25);
      const p75 = percentile(b.mileages, 0.75);
      const medPrice = percentile(b.prices, 0.5);
      return {
        model_year: b.model_year,
        is_hybrid: b.is_hybrid,
        count: b.mileages.length || b.prices.length,
        median_mileage: med !== null ? Math.round(med) : null,
        p25_mileage: p25 !== null ? Math.round(p25) : null,
        p75_mileage: p75 !== null ? Math.round(p75) : null,
        median_price_usd: medPrice !== null ? Math.round(medPrice) : null,
      };
    })
    .sort((a, b) =>
      a.model_year !== b.model_year
        ? a.model_year - b.model_year
        : (a.is_hybrid === null ? 1 : 0) - (b.is_hybrid === null ? 1 : 0),
    );
}

export async function getVehiclesWithLatestListing(
  opts: { limit?: number; v35aOnly?: boolean } = {},
): Promise<VehicleWithListing[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.v35aOnly) where.push("v.engine_code LIKE '%V35A%'");
  const limit = opts.limit ?? 500;

  const sql = `
    SELECT
      v.vin, v.model_year, v.trim, v.body_style, v.drivetrain, v.engine_code,
      v.is_hybrid, v.exterior_color,
      v.first_seen_at, v.last_seen_at,
      l.mileage, l.asking_price_usd, l.url AS listing_url, l.observed_at,
      rs1.status AS recall_24v381,
      rs2.status AS recall_25v767
      FROM vehicles v
      LEFT JOIN (
        SELECT vin, mileage, asking_price_usd, url, observed_at
          FROM (
            SELECT vin, mileage, asking_price_usd, url, observed_at,
                   ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
              FROM listing_observations
          ) t WHERE rn = 1
      ) l ON l.vin = v.vin
      LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
      LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY v.model_year IS NULL, v.model_year DESC, l.observed_at IS NULL, l.observed_at DESC
     LIMIT ?
  `;
  params.push(limit);

  const rows = await query<{
    vin: string;
    model_year: number | null;
    trim: string | null;
    body_style: string | null;
    drivetrain: string | null;
    engine_code: string | null;
    is_hybrid: number | null;
    exterior_color: string | null;
    first_seen_at: string;
    last_seen_at: string;
    mileage: number | null;
    asking_price_usd: number | null;
    listing_url: string | null;
    observed_at: string | null;
    recall_24v381: string | null;
    recall_25v767: string | null;
  }>(sql, params);

  const now = Date.now();
  return rows.map((r) => {
    const lastSeen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
    const days = lastSeen ? Math.floor((now - lastSeen) / 86400000) : 999;
    return {
      ...r,
      is_hybrid: toBool(r.is_hybrid),
      days_since_last_seen: days,
      is_currently_listed: days <= 1,
    };
  });
}

export interface MileageBucket {
  bucket_floor: number;
  count: number;
  hybrid: number;
  nonhybrid: number;
}

export async function getMileageHistogram(): Promise<MileageBucket[]> {
  // Latest mileage per VIN limited to V35A 3rd-gen, fetched into JS for bucketing.
  const rows = await query<{ mileage: number; is_hybrid: number | null }>(`
    SELECT mileage, is_hybrid FROM (
      SELECT lo.mileage, v.is_hybrid,
             ROW_NUMBER() OVER (PARTITION BY lo.vin ORDER BY lo.observed_at DESC) AS rn
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
       WHERE v.engine_code LIKE '%V35A%' AND v.model_year >= 2022
         AND lo.mileage IS NOT NULL
    ) t WHERE rn = 1
  `);
  const buckets = new Map<number, { count: number; hybrid: number; nonhybrid: number }>();
  for (const r of rows) {
    const floor = Math.min(Math.floor(r.mileage / 10000) * 10000, 200000);
    const b = buckets.get(floor) ?? { count: 0, hybrid: 0, nonhybrid: 0 };
    b.count++;
    const h = toBool(r.is_hybrid);
    if (h === true) b.hybrid++;
    else if (h === false) b.nonhybrid++;
    buckets.set(floor, b);
  }
  return [...buckets.entries()]
    .map(([bucket_floor, v]) => ({ bucket_floor, ...v }))
    .sort((a, b) => a.bucket_floor - b.bucket_floor);
}

export interface HighMileageVehicle {
  vin: string;
  model_year: number | null;
  trim: string | null;
  is_hybrid: boolean | null;
  mileage: number;
  asking_price_usd: number | null;
  listing_url: string | null;
  recall_24v381: string | null;
  recall_25v767: string | null;
  age_years: number | null;
  miles_per_year: number | null;
}

export async function getHighMileageVehicles(limit = 15): Promise<HighMileageVehicle[]> {
  const rows = await query<{
    vin: string;
    model_year: number | null;
    trim: string | null;
    is_hybrid: number | null;
    mileage: number;
    asking_price_usd: number | null;
    listing_url: string | null;
    recall_24v381: string | null;
    recall_25v767: string | null;
  }>(`
    SELECT v.vin, v.model_year, v.trim, v.is_hybrid,
           l.mileage, l.asking_price_usd, l.listing_url,
           rs1.status AS recall_24v381,
           rs2.status AS recall_25v767
      FROM (
        SELECT vin, mileage, asking_price_usd, url AS listing_url,
               ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
          FROM listing_observations
      ) l
      JOIN vehicles v ON v.vin = l.vin
      LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
      LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
     WHERE l.rn = 1
       AND v.engine_code LIKE '%V35A%' AND v.model_year >= 2022
       AND l.mileage IS NOT NULL
     ORDER BY l.mileage DESC
     LIMIT ?
  `, [limit]);

  const currentYear = new Date().getFullYear();
  return rows.map((r) => {
    const ageYears =
      r.model_year !== null ? Math.max(0.5, currentYear - r.model_year + 0.5) : null;
    const milesPerYear =
      ageYears !== null && ageYears > 0 ? Math.round(r.mileage / ageYears) : null;
    return {
      ...r,
      is_hybrid: toBool(r.is_hybrid),
      age_years: ageYears,
      miles_per_year: milesPerYear,
    };
  });
}

export interface MileageVsAgePoint {
  vin: string;
  age_months: number;
  mileage: number;
  is_hybrid: boolean | null;
  has_open_recall: boolean;
}

export async function getMileageVsAge(): Promise<MileageVsAgePoint[]> {
  // age_months computed in JS — SQLite math on dates is doable but
  // unixepoch math + division by 30.44 is clearer here.
  const rows = await query<{
    vin: string;
    model_year: number;
    mileage: number;
    is_hybrid: number | null;
    has_open_recall: number;
  }>(`
    SELECT v.vin, v.model_year, l.mileage, v.is_hybrid,
           CASE WHEN EXISTS(
             SELECT 1 FROM recall_status rs WHERE rs.vin = v.vin AND rs.status = 'open'
           ) THEN 1 ELSE 0 END AS has_open_recall
      FROM (
        SELECT vin, mileage,
               ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
          FROM listing_observations
      ) l
      JOIN vehicles v ON v.vin = l.vin
     WHERE l.rn = 1
       AND v.engine_code LIKE '%V35A%' AND v.model_year >= 2022
       AND l.mileage IS NOT NULL AND v.model_year IS NOT NULL
  `);

  const nowMs = Date.now();
  return rows.map((r) => {
    const start = new Date(r.model_year, 0, 1).getTime();
    const months = Math.max(0, Math.round((nowMs - start) / (1000 * 3600 * 24 * 30.44)));
    return {
      vin: r.vin,
      age_months: months,
      mileage: r.mileage,
      is_hybrid: toBool(r.is_hybrid),
      has_open_recall: r.has_open_recall === 1,
    };
  });
}

export interface RecallByMileageBucket {
  bucket_floor: number;
  total: number;
  any_open: number;
  not_listed: number;
  not_polled: number;
}

export async function getRecallByMileage(): Promise<RecallByMileageBucket[]> {
  const rows = await query<{
    bucket_floor: number;
    total: number;
    any_open: number;
    not_listed: number;
    not_polled: number;
  }>(`
    WITH latest AS (
      SELECT lo.vin, lo.mileage,
             ROW_NUMBER() OVER (PARTITION BY lo.vin ORDER BY lo.observed_at DESC) AS rn
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
       WHERE v.engine_code LIKE '%V35A%' AND v.model_year BETWEEN 2022 AND 2024
    ),
    classified AS (
      SELECT
        l.vin,
        MIN(((l.mileage / 10000) * 10000), 100000) AS bucket_floor,
        CASE WHEN EXISTS(SELECT 1 FROM recall_status rs WHERE rs.vin = l.vin AND rs.status = 'open') THEN 1 ELSE 0 END AS any_open,
        CASE WHEN EXISTS(SELECT 1 FROM recall_status rs WHERE rs.vin = l.vin) THEN 1 ELSE 0 END AS polled
      FROM latest l
      WHERE l.rn = 1 AND l.mileage IS NOT NULL
    )
    SELECT
      bucket_floor,
      COUNT(*)                                                            AS total,
      SUM(any_open)                                                       AS any_open,
      SUM(CASE WHEN polled = 1 AND any_open = 0 THEN 1 ELSE 0 END)        AS not_listed,
      SUM(CASE WHEN polled = 0 THEN 1 ELSE 0 END)                         AS not_polled
    FROM classified
    GROUP BY bucket_floor
    ORDER BY bucket_floor
  `);
  return rows;
}

export type EngineRecallState =
  | "open"
  | "pending_remedy"
  | "unknown"
  | "not_polled"
  | "post_recall_build";

export interface CombinedRecallRow {
  vin: string;
  model_year: number | null;
  is_hybrid: boolean | null;
  trim: string | null;
  mileage: number | null;
  state: EngineRecallState;
  toyota_24v381: string | null;
  toyota_25v767: string | null;
  carfax_engine_status: string | null;
  carfax_engine_listed: boolean | null;
}

export async function getCombinedRecallStates(): Promise<CombinedRecallRow[]> {
  const rows = await query<{
    vin: string;
    model_year: number | null;
    is_hybrid: number | null;
    trim: string | null;
    mileage: number | null;
    state: EngineRecallState;
    toyota_24v381: string | null;
    toyota_25v767: string | null;
    carfax_engine_status: string | null;
    carfax_engine_listed: number | null;
  }>(`
    WITH latest AS (
      SELECT lo.vin, lo.mileage,
             ROW_NUMBER() OVER (PARTITION BY lo.vin ORDER BY lo.observed_at DESC) AS rn
        FROM listing_observations lo
    ),
    latest_carfax AS (
      SELECT vin, engine_recall_listed, engine_recall_status,
             ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
        FROM carfax_observations
    )
    SELECT
      v.vin, v.model_year, v.is_hybrid, v.trim,
      l.mileage,
      CASE
        WHEN v.engine_code NOT LIKE '%V35A%' THEN 'post_recall_build'
        WHEN v.model_year >= 2025 THEN 'post_recall_build'
        WHEN rs1.status = 'open' THEN 'open'
        WHEN cf.engine_recall_status = 'remedy_available' THEN 'open'
        WHEN cf.engine_recall_status = 'remedy_not_yet_available' THEN 'pending_remedy'
        WHEN rs2.status = 'open' THEN 'pending_remedy'
        WHEN rs1.vin IS NULL AND cf.vin IS NULL THEN 'not_polled'
        ELSE 'unknown'
      END AS state,
      rs1.status AS toyota_24v381,
      rs2.status AS toyota_25v767,
      cf.engine_recall_status AS carfax_engine_status,
      cf.engine_recall_listed AS carfax_engine_listed
    FROM vehicles v
    LEFT JOIN latest l ON l.vin = v.vin AND l.rn = 1
    LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
    LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
    LEFT JOIN latest_carfax cf ON cf.vin = v.vin AND cf.rn = 1
    WHERE v.model_year >= 2022
    ORDER BY v.model_year DESC, v.vin
  `);
  return rows.map((r) => ({
    ...r,
    is_hybrid: toBool(r.is_hybrid),
    carfax_engine_listed: toBool(r.carfax_engine_listed),
  }));
}

// ── NHTSA owner complaints ────────────────────────────────────────────────

const MILEAGE_BUCKET_CASE = `
  CASE
    WHEN miles_at_failure < 5000   THEN 0
    WHEN miles_at_failure < 10000  THEN 5000
    WHEN miles_at_failure < 20000  THEN 10000
    WHEN miles_at_failure < 30000  THEN 20000
    WHEN miles_at_failure < 40000  THEN 30000
    WHEN miles_at_failure < 50000  THEN 40000
    WHEN miles_at_failure < 75000  THEN 50000
    WHEN miles_at_failure < 100000 THEN 75000
    ELSE 100000
  END
`;
const MILEAGE_BUCKET_LABEL = `
  CASE
    WHEN miles_at_failure < 5000   THEN '0-5k'
    WHEN miles_at_failure < 10000  THEN '5-10k'
    WHEN miles_at_failure < 20000  THEN '10-20k'
    WHEN miles_at_failure < 30000  THEN '20-30k'
    WHEN miles_at_failure < 40000  THEN '30-40k'
    WHEN miles_at_failure < 50000  THEN '40-50k'
    WHEN miles_at_failure < 75000  THEN '50-75k'
    WHEN miles_at_failure < 100000 THEN '75-100k'
    ELSE '100k+'
  END
`;

export interface FailureMileageBucket {
  bucket_floor: number;
  bucket_label: string;
  total_complaints: number;
  engine_complaints: number;
  stall_mentions: number;
}

export async function getFailureMileageHistogram(): Promise<FailureMileageBucket[]> {
  return query<FailureMileageBucket>(`
    SELECT
      bucket_floor,
      bucket_label,
      COUNT(*)                                                            AS total_complaints,
      SUM(CASE WHEN component LIKE '%engine%' THEN 1 ELSE 0 END)          AS engine_complaints,
      SUM(CASE WHEN description LIKE '%stall%' THEN 1 ELSE 0 END)         AS stall_mentions
    FROM (
      SELECT
        component, description,
        ${MILEAGE_BUCKET_CASE}  AS bucket_floor,
        ${MILEAGE_BUCKET_LABEL} AS bucket_label
      FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA'
        AND model_year BETWEEN 2022 AND 2024
        AND miles_at_failure IS NOT NULL
    ) bucketed
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
}

export interface ComplaintSample {
  cmplid: string;
  vin_prefix: string | null;
  model_year: number | null;
  miles_at_failure: number | null;
  fail_date: string | null;
  component: string | null;
  description: string | null;
  vehicle_towed: boolean | null;
  state: string | null;
}

export async function getEngineComplaintSamples(limit = 20): Promise<ComplaintSample[]> {
  const rows = await query<Omit<ComplaintSample, "vehicle_towed"> & { vehicle_towed: number | null }>(
    `SELECT cmplid, vin_prefix, model_year, miles_at_failure, fail_date,
            component, description, vehicle_towed, state
       FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA'
        AND model_year BETWEEN 2022 AND 2024
        AND component LIKE '%engine%'
        AND miles_at_failure IS NOT NULL
        AND miles_at_failure > 0
      ORDER BY miles_at_failure DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ ...r, vehicle_towed: toBool(r.vehicle_towed) }));
}

export interface ComplaintCrossRef {
  vin: string;
  vin_prefix: string;
  model_year: number | null;
  is_hybrid: boolean | null;
  trim: string | null;
  complaints_for_prefix: number;
  engine_complaints_for_prefix: number;
}

export async function getInventoryWithComplaints(): Promise<ComplaintCrossRef[]> {
  const rows = await query<Omit<ComplaintCrossRef, "is_hybrid"> & { is_hybrid: number | null }>(`
    WITH complaint_summary AS (
      SELECT
        vin_prefix,
        COUNT(*)                                                    AS complaints,
        SUM(CASE WHEN component LIKE '%engine%' THEN 1 ELSE 0 END)  AS engine
      FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA' AND vin_prefix IS NOT NULL
      GROUP BY vin_prefix
    )
    SELECT v.vin,
           substr(v.vin, 1, 11)              AS vin_prefix,
           v.model_year, v.is_hybrid, v.trim,
           cs.complaints                     AS complaints_for_prefix,
           cs.engine                         AS engine_complaints_for_prefix
      FROM vehicles v
      JOIN complaint_summary cs ON cs.vin_prefix = substr(v.vin, 1, 11)
     WHERE v.engine_code LIKE '%V35A%'
       AND v.model_year BETWEEN 2022 AND 2024
     ORDER BY cs.engine DESC, v.vin
  `);
  return rows.map((r) => ({ ...r, is_hybrid: toBool(r.is_hybrid) }));
}

export interface ComplaintTotals {
  total: number;
  engine_with_mileage: number;
  median_failure_mileage: number | null;
  earliest_failure: number | null;
  latest_failure: number | null;
  with_tow: number;
}

export async function getComplaintTotals(): Promise<ComplaintTotals> {
  // Aggregate counts in SQL; median computed in JS.
  const scalars = await queryOne<{
    total: number;
    engine_with_mileage: number;
    earliest_failure: number | null;
    latest_failure: number | null;
    with_tow: number;
  }>(`
    SELECT
      COUNT(*)                                                                         AS total,
      SUM(CASE WHEN component LIKE '%engine%' AND miles_at_failure IS NOT NULL THEN 1 ELSE 0 END) AS engine_with_mileage,
      MIN(CASE WHEN component LIKE '%engine%' AND miles_at_failure > 0 THEN miles_at_failure END) AS earliest_failure,
      MAX(CASE WHEN component LIKE '%engine%' AND miles_at_failure > 0 THEN miles_at_failure END) AS latest_failure,
      SUM(CASE WHEN component LIKE '%engine%' AND vehicle_towed = 1 THEN 1 ELSE 0 END)            AS with_tow
    FROM nhtsa_complaints
    WHERE make='TOYOTA' AND model='TUNDRA' AND model_year BETWEEN 2022 AND 2024
  `);

  const mileages = await query<{ miles_at_failure: number }>(`
    SELECT miles_at_failure FROM nhtsa_complaints
     WHERE make='TOYOTA' AND model='TUNDRA' AND model_year BETWEEN 2022 AND 2024
       AND component LIKE '%engine%' AND miles_at_failure IS NOT NULL
  `);
  const med = percentile(mileages.map((r) => r.miles_at_failure), 0.5);

  if (!scalars) {
    return { total: 0, engine_with_mileage: 0, median_failure_mileage: null, earliest_failure: null, latest_failure: null, with_tow: 0 };
  }
  return {
    ...scalars,
    median_failure_mileage: med !== null ? Math.round(med) : null,
  };
}

// ── Charts ────────────────────────────────────────────────────────────────

export interface RecallStateByCohort {
  year: number;
  hybrid: boolean | null;
  open: number;
  pending: number;
  unknown: number;
}

export async function getRecallStatesByCohort(): Promise<RecallStateByCohort[]> {
  const rows = await query<{
    year: number;
    hybrid: number | null;
    open: number;
    pending: number;
    unknown: number;
  }>(`
    WITH classified AS (
      SELECT
        v.model_year                                AS year,
        v.is_hybrid                                 AS hybrid,
        CASE
          WHEN rs1.status = 'open' OR cf.engine_recall_status = 'remedy_available' THEN 'open'
          WHEN rs2.status = 'open' OR cf.engine_recall_status = 'remedy_not_yet_available' THEN 'pending'
          ELSE 'unknown'
        END                                          AS state
      FROM vehicles v
      LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
      LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
      LEFT JOIN (
        SELECT vin, engine_recall_status,
               ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
          FROM carfax_observations
      ) cf ON cf.vin = v.vin AND cf.rn = 1
      WHERE v.engine_code LIKE '%V35A%'
        AND v.model_year BETWEEN 2022 AND 2024
    )
    SELECT year, hybrid,
      SUM(CASE WHEN state='open' THEN 1 ELSE 0 END)    AS open,
      SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN state='unknown' THEN 1 ELSE 0 END) AS unknown
    FROM classified
    GROUP BY year, hybrid
    ORDER BY year, hybrid IS NULL, hybrid
  `);
  return rows.map((r) => ({ ...r, hybrid: toBool(r.hybrid) }));
}

export interface ComplaintsByMonth {
  month: string;
  total: number;
  engine: number;
  with_tow: number;
}

export async function getComplaintsByMonth(): Promise<ComplaintsByMonth[]> {
  return query<ComplaintsByMonth>(`
    SELECT
      strftime('%Y-%m', fail_date)                                                   AS month,
      COUNT(*)                                                                       AS total,
      SUM(CASE WHEN component LIKE '%engine%' THEN 1 ELSE 0 END)                     AS engine,
      SUM(CASE WHEN component LIKE '%engine%' AND vehicle_towed = 1 THEN 1 ELSE 0 END) AS with_tow
    FROM nhtsa_complaints
    WHERE make='TOYOTA' AND model='TUNDRA'
      AND model_year BETWEEN 2022 AND 2024
      AND fail_date IS NOT NULL
      AND fail_date >= '2022-01-01'
    GROUP BY 1
    ORDER BY 1
  `);
}

export interface FailurePhrase {
  phrase: string;
  count: number;
}

export async function getTopFailurePhrases(): Promise<FailurePhrase[]> {
  const phrases = [
    "stall", "main bearing", "engine replac", "knocking", "loss of power",
    "towed", "no start", "check engine", "loss of motive",
    "warranty", "hesitation", "vibration", "pull over when safe",
    "metal shaving", "oil pressure", "rough idle",
  ];
  const out: FailurePhrase[] = [];
  for (const p of phrases) {
    const r = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM nhtsa_complaints
        WHERE make='TOYOTA' AND model='TUNDRA'
          AND model_year BETWEEN 2022 AND 2024
          AND component LIKE '%engine%'
          AND description LIKE ?`,
      [`%${p}%`],
    );
    if (r) out.push({ phrase: p, count: r.count });
  }
  return out.filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
}

export interface ComplaintsByState {
  state: string;
  total: number;
  engine: number;
}

export async function getComplaintsByState(limit = 12): Promise<ComplaintsByState[]> {
  return query<ComplaintsByState>(`
    SELECT state,
           COUNT(*)                                                     AS total,
           SUM(CASE WHEN component LIKE '%engine%' THEN 1 ELSE 0 END)   AS engine
      FROM nhtsa_complaints
     WHERE make='TOYOTA' AND model='TUNDRA'
       AND model_year BETWEEN 2022 AND 2024
       AND state IS NOT NULL AND state != ''
     GROUP BY state
     ORDER BY engine DESC, total DESC
     LIMIT ?
  `, [limit]);
}

export interface PriceMileagePoint {
  vin: string;
  mileage: number;
  price: number;
  is_hybrid: boolean | null;
  model_year: number | null;
}

export async function getPriceMileagePoints(): Promise<PriceMileagePoint[]> {
  const rows = await query<Omit<PriceMileagePoint, "is_hybrid"> & { is_hybrid: number | null }>(`
    SELECT v.vin, l.mileage, l.asking_price_usd AS price, v.is_hybrid, v.model_year
      FROM (
        SELECT vin, mileage, asking_price_usd,
               ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
          FROM listing_observations
      ) l
      JOIN vehicles v ON v.vin = l.vin
     WHERE l.rn = 1
       AND v.engine_code LIKE '%V35A%' AND v.model_year >= 2022
       AND l.mileage IS NOT NULL AND l.asking_price_usd IS NOT NULL
  `);
  return rows.map((r) => ({ ...r, is_hybrid: toBool(r.is_hybrid) }));
}

export interface SeverityTotals {
  engine_complaints: number;
  total_towed: number;
  total_crashed: number;
  total_fires: number;
  total_injured: number;
  total_deaths: number;
}

export async function getSeverityTotals(): Promise<SeverityTotals> {
  const row = await queryOne<SeverityTotals>(`
    SELECT
      SUM(CASE WHEN component LIKE '%engine%' THEN 1 ELSE 0 END)                                     AS engine_complaints,
      SUM(CASE WHEN component LIKE '%engine%' AND vehicle_towed = 1 THEN 1 ELSE 0 END)               AS total_towed,
      SUM(CASE WHEN component LIKE '%engine%' AND crash = 1 THEN 1 ELSE 0 END)                       AS total_crashed,
      SUM(CASE WHEN component LIKE '%engine%' AND fire = 1 THEN 1 ELSE 0 END)                        AS total_fires,
      COALESCE(SUM(CASE WHEN component LIKE '%engine%' THEN num_injured ELSE 0 END), 0)              AS total_injured,
      COALESCE(SUM(CASE WHEN component LIKE '%engine%' THEN num_deaths  ELSE 0 END), 0)              AS total_deaths
    FROM nhtsa_complaints
    WHERE make='TOYOTA' AND model='TUNDRA' AND model_year BETWEEN 2022 AND 2024
  `);
  if (!row) return { engine_complaints: 0, total_towed: 0, total_crashed: 0, total_fires: 0, total_injured: 0, total_deaths: 0 };
  return row;
}

export interface TowRateBucket {
  bucket_label: string;
  total: number;
  towed: number;
  tow_rate: number;
}

export async function getTowRateByMileage(): Promise<TowRateBucket[]> {
  const TOW_BUCKET_CASE = `
    CASE
      WHEN miles_at_failure < 5000  THEN 0
      WHEN miles_at_failure < 10000 THEN 5000
      WHEN miles_at_failure < 20000 THEN 10000
      WHEN miles_at_failure < 30000 THEN 20000
      WHEN miles_at_failure < 40000 THEN 30000
      WHEN miles_at_failure < 50000 THEN 40000
      WHEN miles_at_failure < 75000 THEN 50000
      ELSE 75000
    END
  `;
  const TOW_BUCKET_LABEL = `
    CASE
      WHEN miles_at_failure < 5000  THEN '0-5k'
      WHEN miles_at_failure < 10000 THEN '5-10k'
      WHEN miles_at_failure < 20000 THEN '10-20k'
      WHEN miles_at_failure < 30000 THEN '20-30k'
      WHEN miles_at_failure < 40000 THEN '30-40k'
      WHEN miles_at_failure < 50000 THEN '40-50k'
      WHEN miles_at_failure < 75000 THEN '50-75k'
      ELSE '75k+'
    END
  `;
  const rows = await query<{ bucket_floor: number; bucket_label: string; total: number; towed: number }>(`
    SELECT
      bucket_floor,
      bucket_label,
      COUNT(*) AS total,
      SUM(vehicle_towed) AS towed
    FROM (
      SELECT vehicle_towed,
        ${TOW_BUCKET_CASE}  AS bucket_floor,
        ${TOW_BUCKET_LABEL} AS bucket_label
      FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA'
        AND model_year BETWEEN 2022 AND 2024
        AND component LIKE '%engine%'
        AND miles_at_failure IS NOT NULL
    ) bucketed
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
  return rows.map((r) => {
    const total = r.total;
    const towed = r.towed ?? 0;
    return {
      bucket_label: r.bucket_label,
      total,
      towed,
      tow_rate: total > 0 ? Math.round((towed / total) * 100) : 0,
    };
  });
}

export interface CohortFailureRow {
  year: number;
  hybrid: boolean | null;
  carvana_count: number;
  complaint_count: number;
  engine_complaint_count: number;
  with_tow: number;
}

export async function getCohortFailures(): Promise<CohortFailureRow[]> {
  const rows = await query<Omit<CohortFailureRow, "hybrid"> & { hybrid: number | null }>(`
    WITH our_cohort AS (
      SELECT model_year, is_hybrid, COUNT(*) AS carvana_count
        FROM vehicles
       WHERE engine_code LIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024
       GROUP BY model_year, is_hybrid
    ),
    nhtsa_cohort AS (
      SELECT model_year,
             COUNT(*)                                                          AS complaint_count,
             SUM(CASE WHEN component LIKE '%engine%' THEN 1 ELSE 0 END)        AS engine_complaint_count,
             SUM(CASE WHEN component LIKE '%engine%' AND vehicle_towed = 1 THEN 1 ELSE 0 END) AS with_tow
        FROM nhtsa_complaints
       WHERE make='TOYOTA' AND model='TUNDRA' AND model_year BETWEEN 2022 AND 2024
       GROUP BY model_year
    )
    SELECT
      o.model_year                          AS year,
      o.is_hybrid                           AS hybrid,
      o.carvana_count                       AS carvana_count,
      COALESCE(n.complaint_count, 0)        AS complaint_count,
      COALESCE(n.engine_complaint_count, 0) AS engine_complaint_count,
      COALESCE(n.with_tow, 0)               AS with_tow
    FROM our_cohort o
    LEFT JOIN nhtsa_cohort n ON n.model_year = o.model_year
    ORDER BY o.model_year, o.is_hybrid IS NULL, o.is_hybrid
  `);
  return rows.map((r) => ({ ...r, hybrid: toBool(r.hybrid) }));
}

export interface FailureCurvePoint {
  bucket_floor: number;
  bucket_label: string;
  cumulative_failures: number;
  per_bucket: number;
}

export async function getCumulativeFailureCurve(): Promise<FailureCurvePoint[]> {
  const rows = await query<{ bucket_floor: number; bucket_label: string; per_bucket: number }>(`
    SELECT bucket_floor, bucket_label, COUNT(*) AS per_bucket
    FROM (
      SELECT
        CASE
          WHEN miles_at_failure < 5000  THEN 0
          WHEN miles_at_failure < 10000 THEN 5000
          WHEN miles_at_failure < 20000 THEN 10000
          WHEN miles_at_failure < 30000 THEN 20000
          WHEN miles_at_failure < 40000 THEN 30000
          WHEN miles_at_failure < 50000 THEN 40000
          WHEN miles_at_failure < 75000 THEN 50000
          ELSE 75000
        END AS bucket_floor,
        CASE
          WHEN miles_at_failure < 5000  THEN '0-5k'
          WHEN miles_at_failure < 10000 THEN '5-10k'
          WHEN miles_at_failure < 20000 THEN '10-20k'
          WHEN miles_at_failure < 30000 THEN '20-30k'
          WHEN miles_at_failure < 40000 THEN '30-40k'
          WHEN miles_at_failure < 50000 THEN '40-50k'
          WHEN miles_at_failure < 75000 THEN '50-75k'
          ELSE '75k+'
        END AS bucket_label
      FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA'
        AND model_year BETWEEN 2022 AND 2024
        AND component LIKE '%engine%'
        AND miles_at_failure IS NOT NULL
    ) b
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
  let running = 0;
  return rows.map((r) => {
    running += r.per_bucket;
    return { ...r, cumulative_failures: running };
  });
}

// ── User submissions ────────────────────────────────────────────────────

export interface UserSubmissionTotals {
  total: number;
  total_verified: number;
  replacements: number;
  replacements_verified: number;
  median_replacement_mileage: number | null;
  earliest_replacement_mileage: number | null;
  latest_replacement_mileage: number | null;
  hybrid_replacements: number;
  nonhybrid_replacements: number;
  recall_replacements: number;
  non_recall_replacements: number;
  reports_with_tow: number;
}

export async function getUserSubmissionTotals(): Promise<UserSubmissionTotals> {
  const scalars = await queryOne<Omit<UserSubmissionTotals, "median_replacement_mileage">>(`
    SELECT
      COUNT(*)                                                                                AS total,
      SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END)                                           AS total_verified,
      SUM(CASE WHEN engine_replaced = 1 THEN 1 ELSE 0 END)                                    AS replacements,
      SUM(CASE WHEN engine_replaced = 1 AND verified = 1 THEN 1 ELSE 0 END)                   AS replacements_verified,
      MIN(CASE WHEN engine_replaced = 1 AND replacement_mileage > 0 THEN replacement_mileage END) AS earliest_replacement_mileage,
      MAX(CASE WHEN engine_replaced = 1 AND replacement_mileage > 0 THEN replacement_mileage END) AS latest_replacement_mileage,
      SUM(CASE WHEN engine_replaced = 1 AND is_hybrid = 1 THEN 1 ELSE 0 END)                  AS hybrid_replacements,
      SUM(CASE WHEN engine_replaced = 1 AND is_hybrid = 0 THEN 1 ELSE 0 END)                  AS nonhybrid_replacements,
      SUM(CASE WHEN engine_replaced = 1 AND under_recall = 1 THEN 1 ELSE 0 END)               AS recall_replacements,
      SUM(CASE WHEN engine_replaced = 1 AND under_recall = 0 THEN 1 ELSE 0 END)               AS non_recall_replacements,
      SUM(CASE WHEN engine_replaced = 1 AND was_towed = 1 THEN 1 ELSE 0 END)                  AS reports_with_tow
    FROM user_submissions
    WHERE honeypot_failed = 0
  `);

  const mileages = await query<{ replacement_mileage: number }>(`
    SELECT replacement_mileage FROM user_submissions
     WHERE honeypot_failed = 0
       AND engine_replaced = 1 AND replacement_mileage IS NOT NULL
  `);
  const med = percentile(mileages.map((r) => r.replacement_mileage), 0.5);

  const base: UserSubmissionTotals = scalars
    ? { ...scalars, median_replacement_mileage: med !== null ? Math.round(med) : null }
    : {
        total: 0, total_verified: 0, replacements: 0, replacements_verified: 0,
        median_replacement_mileage: null,
        earliest_replacement_mileage: null, latest_replacement_mileage: null,
        hybrid_replacements: 0, nonhybrid_replacements: 0,
        recall_replacements: 0, non_recall_replacements: 0, reports_with_tow: 0,
      };
  return base;
}

export interface UserReplacementRow {
  id: number;
  submitted_at: string;
  vin_prefix: string;
  model_year: number | null;
  trim: string | null;
  is_hybrid: boolean | null;
  replacement_date: string | null;
  replacement_mileage: number | null;
  failure_mode: string | null;
  was_towed: boolean | null;
  under_recall: boolean | null;
  recall_campaign: string | null;
  dealer_state: string | null;
  notes: string | null;
  verified: boolean;
}

export async function getRecentUserReplacements(limit = 25): Promise<UserReplacementRow[]> {
  const rows = await query<{
    id: number;
    submitted_at: string;
    vin_prefix: string;
    model_year: number | null;
    trim: string | null;
    is_hybrid: number | null;
    replacement_date: string | null;
    replacement_mileage: number | null;
    failure_mode: string | null;
    was_towed: number | null;
    under_recall: number | null;
    recall_campaign: string | null;
    dealer_state: string | null;
    notes: string | null;
    verified: number;
  }>(
    `SELECT
        id, submitted_at,
        substr(vin, 1, 11) AS vin_prefix,
        model_year, trim, is_hybrid,
        replacement_date,
        replacement_mileage, failure_mode, was_towed,
        under_recall, recall_campaign,
        dealer_state, notes,
        verified
      FROM user_submissions
      WHERE honeypot_failed = 0
        AND engine_replaced = 1
      ORDER BY submitted_at DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    ...r,
    is_hybrid: toBool(r.is_hybrid),
    was_towed: toBool(r.was_towed),
    under_recall: toBool(r.under_recall),
    verified: r.verified === 1,
  }));
}

export interface UserMileageBucket {
  bucket_floor: number;
  bucket_label: string;
  reports: number;
}

export async function getUserReplacementMileageHistogram(): Promise<UserMileageBucket[]> {
  return query<UserMileageBucket>(`
    SELECT bucket_floor, bucket_label, COUNT(*) AS reports
    FROM (
      SELECT
        CASE
          WHEN replacement_mileage < 5000   THEN 0
          WHEN replacement_mileage < 10000  THEN 5000
          WHEN replacement_mileage < 20000  THEN 10000
          WHEN replacement_mileage < 30000  THEN 20000
          WHEN replacement_mileage < 40000  THEN 30000
          WHEN replacement_mileage < 50000  THEN 40000
          WHEN replacement_mileage < 75000  THEN 50000
          WHEN replacement_mileage < 100000 THEN 75000
          ELSE 100000
        END AS bucket_floor,
        CASE
          WHEN replacement_mileage < 5000   THEN '0-5k'
          WHEN replacement_mileage < 10000  THEN '5-10k'
          WHEN replacement_mileage < 20000  THEN '10-20k'
          WHEN replacement_mileage < 30000  THEN '20-30k'
          WHEN replacement_mileage < 40000  THEN '30-40k'
          WHEN replacement_mileage < 50000  THEN '40-50k'
          WHEN replacement_mileage < 75000  THEN '50-75k'
          WHEN replacement_mileage < 100000 THEN '75-100k'
          ELSE '100k+'
        END AS bucket_label
      FROM user_submissions
      WHERE honeypot_failed = 0
        AND engine_replaced = 1
        AND replacement_mileage IS NOT NULL
        AND replacement_mileage > 0
    ) bucketed
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
}

// ── Recall remediation progress (NHTSA quarterly §573 filings) ──────────

export interface RecallRemediationRow {
  recall_id: string;
  quarter: string;
  involved: number | null;
  total_remedied: number | null;
  total_unreachable: number | null;
  total_removed: number | null;
  submission_date: string | null;
  pct_remedied: number | null;
  pct_remaining: number | null;
}

/**
 * Cumulative remediation per recall per quarter, sourced from NHTSA's
 * FLAT_RCL_Qrtly_Rpts feed of Toyota's §573 §577.5 quarterly filings.
 * Ground-truth answer to "how many V35A engines have actually been swapped."
 */
export async function getRecallRemediation(): Promise<RecallRemediationRow[]> {
  const rows = await query<{
    recall_id: string;
    quarter: string;
    involved: number | null;
    total_remedied: number | null;
    total_unreachable: number | null;
    total_removed: number | null;
    submission_date: string | null;
  }>(`
    SELECT recall_id, quarter, involved, total_remedied,
           total_unreachable, total_removed, submission_date
      FROM recall_quarterly_reports
     ORDER BY recall_id, quarter
  `);
  return rows.map((r) => {
    const denom = r.involved ?? 0;
    const remedied = r.total_remedied ?? 0;
    const removed = r.total_removed ?? 0;
    const unreachable = r.total_unreachable ?? 0;
    const pct_remedied = denom > 0 ? Math.round((remedied / denom) * 1000) / 10 : null;
    const pct_remaining =
      denom > 0
        ? Math.round(((denom - remedied - removed - unreachable) / denom) * 1000) / 10
        : null;
    return { ...r, pct_remedied, pct_remaining };
  });
}

// ── Recall PDFs (Toyota's §573 filings, parsed to text) ─────────────────

export interface RecallDocumentRow {
  id: number;
  recall_id: string;
  doc_type: string;
  filename: string;
  title: string | null;
  submission_date: string | null;
  source_url: string | null;
  page_count: number | null;
  excerpt: string;
}

/** Smart excerpt: prefer a defect/consequence/chronology paragraph. */
function pickExcerpt(body: string | null): string {
  if (!body) return "";
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  // Try to grab the sentence around the strongest keyword.
  const keywords = [
    "machining debris",
    "main bearing",
    "engine assembly",
    "knock",
    "stall",
    "defect",
    "consequence",
    "remedy",
  ];
  for (const kw of keywords) {
    const idx = cleaned.toLowerCase().indexOf(kw);
    if (idx > -1) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(cleaned.length, idx + 320);
      const slice = cleaned.slice(start, end);
      return (start > 0 ? "… " : "") + slice + (end < cleaned.length ? " …" : "");
    }
  }
  return cleaned.slice(0, 380) + (cleaned.length > 380 ? " …" : "");
}

export async function getRecallDocuments(): Promise<RecallDocumentRow[]> {
  const rows = await query<{
    id: number;
    recall_id: string;
    doc_type: string;
    filename: string;
    title: string | null;
    submission_date: string | null;
    source_url: string | null;
    page_count: number | null;
    body: string | null;
  }>(`
    SELECT id, recall_id, doc_type, filename, title, submission_date,
           source_url, page_count, body
      FROM recall_documents
     WHERE page_count > 0
     ORDER BY recall_id, submission_date IS NULL, submission_date DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    recall_id: r.recall_id,
    doc_type: r.doc_type,
    filename: r.filename,
    title: r.title,
    submission_date: r.submission_date,
    source_url: r.source_url,
    page_count: r.page_count,
    excerpt: pickExcerpt(r.body),
  }));
}

// ── Engine replacement inference (deductive from Carfax + year scope) ───

export interface EngineReplacementInference {
  // 2022-2023 V35A = ALL in scope for 24V381. "Recall not listed" in Carfax
  // means the recall was completed → engine almost certainly replaced.
  in_scope_22_23: number;
  likely_replaced_22_23: number;
  still_open_22_23: number;
  no_carfax_22_23: number;
  // 2024 V35A = all in scope for 25V767, remedy not out yet → no replacements
  in_scope_24: number;
  pending_24: number;
  // Pulled-forward percentage
  pct_likely_replaced_22_23: number;
}

export async function getEngineReplacementInference(): Promise<EngineReplacementInference> {
  const row = await queryOne<{
    in_scope_22_23: number;
    likely_replaced_22_23: number;
    still_open_22_23: number;
    no_carfax_22_23: number;
    in_scope_24: number;
    pending_24: number;
  }>(`
    WITH lc AS (
      SELECT vin, engine_recall_listed,
             ROW_NUMBER() OVER (PARTITION BY vin ORDER BY observed_at DESC) AS rn
        FROM carfax_observations
    ),
    latest AS (SELECT vin, engine_recall_listed FROM lc WHERE rn = 1)
    SELECT
      SUM(CASE WHEN v.model_year BETWEEN 2022 AND 2023 THEN 1 ELSE 0 END)                                    AS in_scope_22_23,
      SUM(CASE WHEN v.model_year BETWEEN 2022 AND 2023 AND latest.engine_recall_listed = 0 THEN 1 ELSE 0 END) AS likely_replaced_22_23,
      SUM(CASE WHEN v.model_year BETWEEN 2022 AND 2023 AND latest.engine_recall_listed = 1 THEN 1 ELSE 0 END) AS still_open_22_23,
      SUM(CASE WHEN v.model_year BETWEEN 2022 AND 2023 AND latest.vin IS NULL THEN 1 ELSE 0 END)              AS no_carfax_22_23,
      SUM(CASE WHEN v.model_year = 2024 THEN 1 ELSE 0 END)                                                    AS in_scope_24,
      SUM(CASE WHEN v.model_year = 2024 AND latest.engine_recall_listed = 1 THEN 1 ELSE 0 END)                AS pending_24
      FROM vehicles v
      LEFT JOIN latest ON latest.vin = v.vin
     WHERE v.engine_code LIKE '%V35A%'
  `);
  const r = row ?? {
    in_scope_22_23: 0, likely_replaced_22_23: 0, still_open_22_23: 0,
    no_carfax_22_23: 0, in_scope_24: 0, pending_24: 0,
  };
  const denom = r.in_scope_22_23 - r.no_carfax_22_23;
  return {
    ...r,
    pct_likely_replaced_22_23: denom > 0 ? Math.round((r.likely_replaced_22_23 / denom) * 100) : 0,
  };
}

// ── NHTSA Manufacturer Communications (TSBs) ─────────────────────────────

export interface MfrCommunication {
  nhtsa_id: string;
  model_years: string;
  summary: string | null;
  engine_keyword: boolean;
  url: string;
}

/**
 * Engine-flagged Toyota Tundra TSBs (NHTSA Manufacturer Communications)
 * with deep links into the NHTSA viewer. These are the pre-recall service
 * bulletins — evidence Toyota was telling dealers about main-bearing and
 * short-block work before NHTSA opened 24V381.
 */
export async function getEngineMfrComms(): Promise<MfrCommunication[]> {
  const rows = await query<{
    nhtsa_id: string;
    model_years: string;
    summary: string | null;
    engine_keyword: number;
  }>(`
    SELECT nhtsa_id, model_years, summary, engine_keyword
      FROM mfr_communications
     WHERE engine_keyword = 1
     ORDER BY nhtsa_id DESC
  `);
  return rows.map((r) => ({
    nhtsa_id: r.nhtsa_id,
    model_years: r.model_years,
    summary: r.summary,
    engine_keyword: r.engine_keyword === 1,
    url: `https://www.nhtsa.gov/odi/tsbs/${r.nhtsa_id}`,
  }));
}

export interface MfrCommsTotals {
  total: number;
  engine_keyword: number;
}

export async function getMfrCommsTotals(): Promise<MfrCommsTotals> {
  const row = await queryOne<MfrCommsTotals>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN engine_keyword = 1 THEN 1 ELSE 0 END) AS engine_keyword
    FROM mfr_communications
  `);
  return row ?? { total: 0, engine_keyword: 0 };
}

export async function getRecallTimeline(days = 60): Promise<RecallTimeline[]> {
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  return query<RecallTimeline>(
    `SELECT date(observed_at) AS day,
            recall_id,
            new_status,
            COUNT(*) AS count
       FROM recall_status_events
      WHERE observed_at >= ?
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    [cutoff],
  );
}
