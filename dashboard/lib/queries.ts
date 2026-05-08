/**
 * Typed read queries for the dashboard. Server-only — never import from a
 * client component.
 *
 * The poller writes per VIN, so these queries see a moving target. That's
 * fine: pages mark themselves dynamic and re-render on every request.
 */
import "server-only";
import { query, queryOne } from "@/lib/db";

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
  recall_24v381: string | null; // 'open' | 'not_listed' | 'unknown' | null (never polled / not eligible)
  recall_25v767: string | null;
}

export interface OverviewCounts {
  vehicles: number;
  recall_eligible: number; // V35A 2022-2024
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
  const row = await queryOne<{
    vehicles: string;
    recall_eligible: string;
    v35a_hybrid: string;
    v35a_nonhybrid: string;
    total_observations: string;
    recall_status_rows: string;
    status_events: string;
    median_mileage_3rdgen: string | null;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM vehicles)                                                       AS vehicles,
      (SELECT COUNT(*) FROM vehicles
        WHERE engine_code ILIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024)               AS recall_eligible,
      (SELECT COUNT(*) FROM vehicles
        WHERE engine_code ILIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024
          AND is_hybrid = TRUE)                                                              AS v35a_hybrid,
      (SELECT COUNT(*) FROM vehicles
        WHERE engine_code ILIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024
          AND is_hybrid = FALSE)                                                             AS v35a_nonhybrid,
      (SELECT COUNT(*) FROM listing_observations)                                            AS total_observations,
      (SELECT COUNT(*) FROM recall_status)                                                   AS recall_status_rows,
      (SELECT COUNT(*) FROM recall_status_events)                                            AS status_events,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY mileage)
         FROM (SELECT DISTINCT ON (lo.vin) lo.mileage
                 FROM listing_observations lo
                 JOIN vehicles v ON v.vin = lo.vin
                 WHERE v.model_year >= 2022 AND lo.mileage IS NOT NULL
                 ORDER BY lo.vin, lo.observed_at DESC) latest)                               AS median_mileage_3rdgen
  `);

  if (!row) {
    return {
      vehicles: 0,
      recall_eligible: 0,
      v35a_hybrid: 0,
      v35a_nonhybrid: 0,
      total_observations: 0,
      recall_status_rows: 0,
      status_events: 0,
      median_mileage_3rdgen: null,
    };
  }
  return {
    vehicles: Number(row.vehicles),
    recall_eligible: Number(row.recall_eligible),
    v35a_hybrid: Number(row.v35a_hybrid),
    v35a_nonhybrid: Number(row.v35a_nonhybrid),
    total_observations: Number(row.total_observations),
    recall_status_rows: Number(row.recall_status_rows),
    status_events: Number(row.status_events),
    median_mileage_3rdgen: row.median_mileage_3rdgen ? Math.round(Number(row.median_mileage_3rdgen)) : null,
  };
}

export async function getRecallBreakdown(): Promise<RecallBreakdown[]> {
  const rows = await query<{ recall_id: string; status: string; count: string }>(
    `SELECT recall_id, status, COUNT(*)::text AS count
       FROM recall_status
      GROUP BY recall_id, status
      ORDER BY recall_id, status`,
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export async function getYearMileageBuckets(): Promise<YearMileageBucket[]> {
  const rows = await query<{
    model_year: number;
    is_hybrid: boolean | null;
    count: string;
    median_mileage: string | null;
    p25_mileage: string | null;
    p75_mileage: string | null;
    median_price_usd: string | null;
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage, lo.asking_price_usd
        FROM listing_observations lo
        ORDER BY lo.vin, lo.observed_at DESC
    )
    SELECT v.model_year,
           v.is_hybrid,
           COUNT(*)::text                                                       AS count,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY l.mileage)                AS median_mileage,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY l.mileage)               AS p25_mileage,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY l.mileage)               AS p75_mileage,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY l.asking_price_usd)       AS median_price_usd
      FROM vehicles v
      JOIN latest l ON l.vin = v.vin
     WHERE v.model_year IS NOT NULL
     GROUP BY v.model_year, v.is_hybrid
     ORDER BY v.model_year, v.is_hybrid NULLS LAST
  `);
  return rows.map((r) => ({
    model_year: Number(r.model_year),
    is_hybrid: r.is_hybrid,
    count: Number(r.count),
    median_mileage: r.median_mileage ? Math.round(Number(r.median_mileage)) : null,
    p25_mileage: r.p25_mileage ? Math.round(Number(r.p25_mileage)) : null,
    p75_mileage: r.p75_mileage ? Math.round(Number(r.p75_mileage)) : null,
    median_price_usd: r.median_price_usd ? Math.round(Number(r.median_price_usd)) : null,
  }));
}

export async function getVehiclesWithLatestListing(
  opts: { limit?: number; v35aOnly?: boolean } = {},
): Promise<VehicleWithListing[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.v35aOnly) {
    where.push("v.engine_code ILIKE '%V35A%'");
  }
  const limit = opts.limit ?? 500;
  params.push(limit);

  const sql = `
    SELECT
      v.vin, v.model_year, v.trim, v.body_style, v.drivetrain, v.engine_code,
      v.is_hybrid, v.exterior_color,
      v.first_seen_at, v.last_seen_at,
      l.mileage, l.asking_price_usd, l.url AS listing_url, l.observed_at,
      rs1.status AS recall_24v381,
      rs2.status AS recall_25v767
      FROM vehicles v
      LEFT JOIN LATERAL (
        SELECT mileage, asking_price_usd, url, observed_at
          FROM listing_observations o
         WHERE o.vin = v.vin
         ORDER BY observed_at DESC LIMIT 1
      ) l ON TRUE
      LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
      LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY v.model_year DESC NULLS LAST, l.observed_at DESC NULLS LAST
     LIMIT $${params.length}
  `;
  return query<VehicleWithListing>(sql, params);
}

export interface MileageBucket {
  bucket_floor: number;
  count: number;
  hybrid: number;
  nonhybrid: number;
}

/**
 * Histogram of latest-observed mileage among 3rd-gen V35A trucks, in 10k bins.
 */
export async function getMileageHistogram(): Promise<MileageBucket[]> {
  const rows = await query<{
    bucket_floor: number;
    count: string;
    hybrid: string;
    nonhybrid: string;
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
        WHERE v.engine_code ILIKE '%V35A%' AND v.model_year >= 2022
        ORDER BY lo.vin, lo.observed_at DESC
    )
    SELECT
      LEAST((mileage / 10000) * 10000, 200000)                                AS bucket_floor,
      COUNT(*)::text                                                          AS count,
      SUM(CASE WHEN v.is_hybrid THEN 1 ELSE 0 END)::text                      AS hybrid,
      SUM(CASE WHEN v.is_hybrid IS FALSE THEN 1 ELSE 0 END)::text             AS nonhybrid
    FROM latest l
    JOIN vehicles v ON v.vin = l.vin
    WHERE l.mileage IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `);
  return rows.map((r) => ({
    bucket_floor: Number(r.bucket_floor),
    count: Number(r.count),
    hybrid: Number(r.hybrid),
    nonhybrid: Number(r.nonhybrid),
  }));
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
    is_hybrid: boolean | null;
    mileage: number;
    asking_price_usd: number | null;
    listing_url: string | null;
    recall_24v381: string | null;
    recall_25v767: string | null;
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage, lo.asking_price_usd, lo.url AS listing_url
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
        WHERE v.engine_code ILIKE '%V35A%' AND v.model_year >= 2022
        ORDER BY lo.vin, lo.observed_at DESC
    )
    SELECT v.vin, v.model_year, v.trim, v.is_hybrid,
           l.mileage, l.asking_price_usd, l.listing_url,
           rs1.status AS recall_24v381,
           rs2.status AS recall_25v767
      FROM latest l
      JOIN vehicles v ON v.vin = l.vin
      LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
      LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
     WHERE l.mileage IS NOT NULL
     ORDER BY l.mileage DESC
     LIMIT $1
  `, [limit]);

  // Toyota MY for the 3rd gen begins production in fall of (year-1)
  const currentYear = new Date().getFullYear();
  return rows.map((r) => {
    const ageYears =
      r.model_year !== null ? Math.max(0.5, currentYear - r.model_year + 0.5) : null;
    const milesPerYear =
      ageYears !== null && ageYears > 0 ? Math.round(r.mileage / ageYears) : null;
    return { ...r, age_years: ageYears, miles_per_year: milesPerYear };
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
  const rows = await query<{
    vin: string;
    age_months: string;
    mileage: number;
    is_hybrid: boolean | null;
    has_open_recall: boolean;
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
        WHERE v.engine_code ILIKE '%V35A%' AND v.model_year >= 2022
        ORDER BY lo.vin, lo.observed_at DESC
    )
    SELECT
      v.vin,
      ((EXTRACT(EPOCH FROM NOW()) -
        EXTRACT(EPOCH FROM make_timestamp(v.model_year, 1, 1, 0, 0, 0)))
       / (3600.0 * 24 * 30.44))::int::text                                                       AS age_months,
      l.mileage,
      v.is_hybrid,
      EXISTS(
        SELECT 1 FROM recall_status rs
         WHERE rs.vin = v.vin AND rs.status = 'open'
      )                                                                                          AS has_open_recall
    FROM latest l
    JOIN vehicles v ON v.vin = l.vin
    WHERE l.mileage IS NOT NULL AND v.model_year IS NOT NULL
  `);
  return rows.map((r) => ({
    vin: r.vin,
    age_months: Number(r.age_months),
    mileage: Number(r.mileage),
    is_hybrid: r.is_hybrid,
    has_open_recall: r.has_open_recall,
  }));
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
    bucket_floor: string;
    total: string;
    any_open: string;
    not_listed: string;
    not_polled: string;
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
        WHERE v.engine_code ILIKE '%V35A%' AND v.model_year BETWEEN 2022 AND 2024
        ORDER BY lo.vin, lo.observed_at DESC
    ),
    classified AS (
      SELECT
        l.vin,
        LEAST((l.mileage / 10000) * 10000, 100000) AS bucket_floor,
        EXISTS(SELECT 1 FROM recall_status rs WHERE rs.vin = l.vin AND rs.status = 'open') AS any_open,
        EXISTS(SELECT 1 FROM recall_status rs WHERE rs.vin = l.vin) AS polled
      FROM latest l
      WHERE l.mileage IS NOT NULL
    )
    SELECT
      bucket_floor::text,
      COUNT(*)::text                                                          AS total,
      SUM(CASE WHEN any_open THEN 1 ELSE 0 END)::text                          AS any_open,
      SUM(CASE WHEN polled AND NOT any_open THEN 1 ELSE 0 END)::text           AS not_listed,
      SUM(CASE WHEN NOT polled THEN 1 ELSE 0 END)::text                        AS not_polled
    FROM classified
    GROUP BY bucket_floor
    ORDER BY bucket_floor
  `);
  return rows.map((r) => ({
    bucket_floor: Number(r.bucket_floor),
    total: Number(r.total),
    any_open: Number(r.any_open),
    not_listed: Number(r.not_listed),
    not_polled: Number(r.not_polled),
  }));
}

export async function getRecallTimeline(days = 60): Promise<RecallTimeline[]> {
  const rows = await query<{ day: string; recall_id: string; new_status: string; count: string }>(
    `SELECT date_trunc('day', observed_at)::date::text AS day,
            recall_id,
            new_status,
            COUNT(*)::text AS count
       FROM recall_status_events
      WHERE observed_at >= NOW() - $1::interval
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    [`${days} days`],
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}
