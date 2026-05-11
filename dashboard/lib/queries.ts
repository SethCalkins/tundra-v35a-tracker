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
  // Days since the VIN was last seen on Carvana. 0/1 = currently listed.
  // 2+ generally means it sold (or scraper hasn't caught up).
  days_since_last_seen: number;
  is_currently_listed: boolean;
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

// Combined recall status — Toyota poll + Carfax observation per VIN.
// Use this for the headline 'engine replaced?' question.
export type EngineRecallState =
  | "open"               // Toyota OR Carfax shows the engine recall as open
  | "pending_remedy"     // 25V767 listed but Toyota's expansion remedy isn't out yet
  | "unknown"            // Neither source lists the engine recall (out-of-scope OR completed)
  | "not_polled"         // We haven't checked yet
  | "post_recall_build"; // 2025+ V35A — built after Toyota fixed the manufacturing process

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
  return query<CombinedRecallRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage
        FROM listing_observations lo
        ORDER BY lo.vin, lo.observed_at DESC
    ),
    latest_carfax AS (
      SELECT DISTINCT ON (vin) vin, engine_recall_listed, engine_recall_status
        FROM carfax_observations
        ORDER BY vin, observed_at DESC
    )
    SELECT
      v.vin,
      v.model_year,
      v.is_hybrid,
      v.trim,
      l.mileage,
      CASE
        WHEN v.engine_code NOT ILIKE '%V35A%' THEN 'post_recall_build'
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
    LEFT JOIN latest l ON l.vin = v.vin
    LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
    LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
    LEFT JOIN latest_carfax cf ON cf.vin = v.vin
    WHERE v.model_year >= 2022
    ORDER BY v.model_year DESC, v.vin
  `);
}


// ── NHTSA owner complaints ────────────────────────────────────────────────

export interface FailureMileageBucket {
  bucket_floor: number;
  bucket_label: string;
  total_complaints: number;
  engine_complaints: number;
  stall_mentions: number;
}

export async function getFailureMileageHistogram(): Promise<FailureMileageBucket[]> {
  const rows = await query<{
    bucket_floor: string;
    bucket_label: string;
    total_complaints: string;
    engine_complaints: string;
    stall_mentions: string;
  }>(`
    SELECT
      bucket_floor::text,
      bucket_label,
      COUNT(*)::text                                                                AS total_complaints,
      SUM((component ILIKE '%engine%')::int)::text                                  AS engine_complaints,
      SUM((description ILIKE '%stall%')::int)::text                                 AS stall_mentions
    FROM (
      SELECT
        component, description,
        CASE
          WHEN miles_at_failure < 5000 THEN 0
          WHEN miles_at_failure < 10000 THEN 5000
          WHEN miles_at_failure < 20000 THEN 10000
          WHEN miles_at_failure < 30000 THEN 20000
          WHEN miles_at_failure < 40000 THEN 30000
          WHEN miles_at_failure < 50000 THEN 40000
          WHEN miles_at_failure < 75000 THEN 50000
          WHEN miles_at_failure < 100000 THEN 75000
          ELSE 100000
        END AS bucket_floor,
        CASE
          WHEN miles_at_failure < 5000 THEN '0-5k'
          WHEN miles_at_failure < 10000 THEN '5-10k'
          WHEN miles_at_failure < 20000 THEN '10-20k'
          WHEN miles_at_failure < 30000 THEN '20-30k'
          WHEN miles_at_failure < 40000 THEN '30-40k'
          WHEN miles_at_failure < 50000 THEN '40-50k'
          WHEN miles_at_failure < 75000 THEN '50-75k'
          WHEN miles_at_failure < 100000 THEN '75-100k'
          ELSE '100k+'
        END AS bucket_label
      FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA'
        AND model_year BETWEEN 2022 AND 2024
        AND miles_at_failure IS NOT NULL
    ) bucketed
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
  return rows.map((r) => ({
    bucket_floor: Number(r.bucket_floor),
    bucket_label: r.bucket_label,
    total_complaints: Number(r.total_complaints),
    engine_complaints: Number(r.engine_complaints),
    stall_mentions: Number(r.stall_mentions),
  }));
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
  return query<ComplaintSample>(
    `SELECT cmplid, vin_prefix, model_year, miles_at_failure, fail_date::text,
            component, description, vehicle_towed, state
       FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA'
        AND model_year BETWEEN 2022 AND 2024
        AND component ILIKE '%engine%'
        AND miles_at_failure IS NOT NULL
        AND miles_at_failure > 0
      ORDER BY miles_at_failure DESC
      LIMIT $1`,
    [limit],
  );
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

/** Show our Carvana inventory rows whose 11-char VIN prefix matches NHTSA complaints. */
export async function getInventoryWithComplaints(): Promise<ComplaintCrossRef[]> {
  return query<ComplaintCrossRef>(`
    WITH complaint_summary AS (
      SELECT
        vin_prefix,
        COUNT(*)                                                AS complaints,
        SUM((component ILIKE '%engine%')::int)                  AS engine
      FROM nhtsa_complaints
      WHERE make='TOYOTA' AND model='TUNDRA' AND vin_prefix IS NOT NULL
      GROUP BY vin_prefix
    )
    SELECT v.vin,
           LEFT(v.vin, 11)                  AS vin_prefix,
           v.model_year, v.is_hybrid, v.trim,
           cs.complaints                     AS complaints_for_prefix,
           cs.engine                         AS engine_complaints_for_prefix
      FROM vehicles v
      JOIN complaint_summary cs ON cs.vin_prefix = LEFT(v.vin, 11)
     WHERE v.engine_code ILIKE '%V35A%'
       AND v.model_year BETWEEN 2022 AND 2024
     ORDER BY cs.engine DESC, v.vin
  `);
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
  const row = await queryOne<{
    total: string; engine_with_mileage: string;
    median_failure_mileage: string | null;
    earliest_failure: string | null; latest_failure: string | null;
    with_tow: string;
  }>(`
    SELECT
      COUNT(*)::text                                                          AS total,
      COUNT(*) FILTER (WHERE component ILIKE '%engine%' AND miles_at_failure IS NOT NULL)::text AS engine_with_mileage,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY miles_at_failure)
        FILTER (WHERE component ILIKE '%engine%' AND miles_at_failure IS NOT NULL) AS median_failure_mileage,
      MIN(miles_at_failure) FILTER (WHERE component ILIKE '%engine%' AND miles_at_failure > 0)::text AS earliest_failure,
      MAX(miles_at_failure) FILTER (WHERE component ILIKE '%engine%' AND miles_at_failure > 0)::text AS latest_failure,
      COUNT(*) FILTER (WHERE component ILIKE '%engine%' AND vehicle_towed)::text AS with_tow
    FROM nhtsa_complaints
    WHERE make='TOYOTA' AND model='TUNDRA' AND model_year BETWEEN 2022 AND 2024
  `);
  if (!row) return { total: 0, engine_with_mileage: 0, median_failure_mileage: null, earliest_failure: null, latest_failure: null, with_tow: 0 };
  return {
    total: Number(row.total),
    engine_with_mileage: Number(row.engine_with_mileage),
    median_failure_mileage: row.median_failure_mileage ? Math.round(Number(row.median_failure_mileage)) : null,
    earliest_failure: row.earliest_failure ? Number(row.earliest_failure) : null,
    latest_failure: row.latest_failure ? Number(row.latest_failure) : null,
    with_tow: Number(row.with_tow),
  };
}

// ── New chart queries ─────────────────────────────────────────────────────

export interface RecallStateByCohort {
  year: number;
  hybrid: boolean;
  open: number;
  pending: number;
  unknown: number;
}

export async function getRecallStatesByCohort(): Promise<RecallStateByCohort[]> {
  const rows = await query<{
    year: string;
    hybrid: boolean;
    open: string;
    pending: string;
    unknown: string;
  }>(`
    WITH classified AS (
      SELECT
        v.model_year::text                              AS year,
        v.is_hybrid                                     AS hybrid,
        CASE
          WHEN rs1.status = 'open' OR cf.engine_recall_status = 'remedy_available' THEN 'open'
          WHEN rs2.status = 'open' OR cf.engine_recall_status = 'remedy_not_yet_available' THEN 'pending'
          ELSE 'unknown'
        END                                              AS state
      FROM vehicles v
      LEFT JOIN recall_status rs1 ON rs1.vin = v.vin AND rs1.recall_id = '24V381'
      LEFT JOIN recall_status rs2 ON rs2.vin = v.vin AND rs2.recall_id = '25V767'
      LEFT JOIN LATERAL (
        SELECT engine_recall_status FROM carfax_observations
         WHERE vin = v.vin ORDER BY observed_at DESC LIMIT 1
      ) cf ON TRUE
      WHERE v.engine_code ILIKE '%V35A%'
        AND v.model_year BETWEEN 2022 AND 2024
    )
    SELECT year, hybrid,
      SUM((state='open')::int)::text     AS open,
      SUM((state='pending')::int)::text  AS pending,
      SUM((state='unknown')::int)::text  AS unknown
    FROM classified
    GROUP BY year, hybrid
    ORDER BY year, hybrid NULLS LAST
  `);
  return rows.map((r) => ({
    year: Number(r.year),
    hybrid: r.hybrid,
    open: Number(r.open),
    pending: Number(r.pending),
    unknown: Number(r.unknown),
  }));
}

export interface ComplaintsByMonth {
  month: string; // YYYY-MM
  total: number;
  engine: number;
  with_tow: number;
}

export async function getComplaintsByMonth(): Promise<ComplaintsByMonth[]> {
  const rows = await query<{
    month: string;
    total: string;
    engine: string;
    with_tow: string;
  }>(`
    SELECT
      to_char(date_trunc('month', fail_date), 'YYYY-MM')      AS month,
      COUNT(*)::text                                          AS total,
      SUM((component ILIKE '%engine%')::int)::text             AS engine,
      SUM((component ILIKE '%engine%' AND vehicle_towed)::int)::text AS with_tow
    FROM nhtsa_complaints
    WHERE make='TOYOTA' AND model='TUNDRA'
      AND model_year BETWEEN 2022 AND 2024
      AND fail_date IS NOT NULL
      AND fail_date >= '2022-01-01'
    GROUP BY 1
    ORDER BY 1
  `);
  return rows.map((r) => ({
    month: r.month,
    total: Number(r.total),
    engine: Number(r.engine),
    with_tow: Number(r.with_tow),
  }));
}

export interface FailurePhrase {
  phrase: string;
  count: number;
}

export async function getTopFailurePhrases(): Promise<FailurePhrase[]> {
  // Hardcoded phrase set + COUNT(*) WHERE description ILIKE '%phrase%'
  // Cleaner than full-text NLP for our scale.
  const phrases = [
    "stall",
    "main bearing",
    "engine replac",
    "knocking",
    "loss of power",
    "towed",
    "no start",
    "check engine",
    "loss of motive",
    "dealer",
    "warranty",
    "hesitation",
    "vibration",
    "pull over when safe",
    "metal shaving",
    "oil pressure",
    "rough idle",
  ];
  const out: FailurePhrase[] = [];
  for (const p of phrases) {
    const r = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM nhtsa_complaints
        WHERE make='TOYOTA' AND model='TUNDRA'
          AND model_year BETWEEN 2022 AND 2024
          AND component ILIKE '%engine%'
          AND description ILIKE $1`,
      [`%${p}%`],
    );
    if (r) out.push({ phrase: p, count: Number(r.count) });
  }
  return out.filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
}

export interface ComplaintsByState {
  state: string;
  total: number;
  engine: number;
}

export async function getComplaintsByState(limit = 12): Promise<ComplaintsByState[]> {
  const rows = await query<{ state: string; total: string; engine: string }>(`
    SELECT state,
           COUNT(*)::text                                  AS total,
           SUM((component ILIKE '%engine%')::int)::text    AS engine
      FROM nhtsa_complaints
     WHERE make='TOYOTA' AND model='TUNDRA'
       AND model_year BETWEEN 2022 AND 2024
       AND state IS NOT NULL AND state != ''
     GROUP BY state
     ORDER BY engine DESC, total DESC
     LIMIT $1
  `, [limit]);
  return rows.map((r) => ({ state: r.state, total: Number(r.total), engine: Number(r.engine) }));
}

export interface PriceMileagePoint {
  vin: string;
  mileage: number;
  price: number;
  is_hybrid: boolean | null;
  model_year: number | null;
}

export async function getPriceMileagePoints(): Promise<PriceMileagePoint[]> {
  return query<PriceMileagePoint>(`
    WITH latest AS (
      SELECT DISTINCT ON (lo.vin) lo.vin, lo.mileage, lo.asking_price_usd
        FROM listing_observations lo
        JOIN vehicles v ON v.vin = lo.vin
        WHERE v.engine_code ILIKE '%V35A%' AND v.model_year >= 2022
        ORDER BY lo.vin, lo.observed_at DESC
    )
    SELECT v.vin,
           l.mileage,
           l.asking_price_usd AS price,
           v.is_hybrid,
           v.model_year
      FROM latest l
      JOIN vehicles v ON v.vin = l.vin
     WHERE l.mileage IS NOT NULL
       AND l.asking_price_usd IS NOT NULL
  `);
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
  const row = await queryOne<{
    engine_complaints: string; total_towed: string;
    total_crashed: string; total_fires: string;
    total_injured: string; total_deaths: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE component ILIKE '%engine%')::text         AS engine_complaints,
      COUNT(*) FILTER (WHERE component ILIKE '%engine%' AND vehicle_towed)::text  AS total_towed,
      COUNT(*) FILTER (WHERE component ILIKE '%engine%' AND crash)::text          AS total_crashed,
      COUNT(*) FILTER (WHERE component ILIKE '%engine%' AND fire)::text           AS total_fires,
      SUM(num_injured) FILTER (WHERE component ILIKE '%engine%')::text             AS total_injured,
      SUM(num_deaths)  FILTER (WHERE component ILIKE '%engine%')::text             AS total_deaths
    FROM nhtsa_complaints
    WHERE make='TOYOTA' AND model='TUNDRA' AND model_year BETWEEN 2022 AND 2024
  `);
  if (!row) return { engine_complaints: 0, total_towed: 0, total_crashed: 0, total_fires: 0, total_injured: 0, total_deaths: 0 };
  return {
    engine_complaints: Number(row.engine_complaints),
    total_towed: Number(row.total_towed),
    total_crashed: Number(row.total_crashed),
    total_fires: Number(row.total_fires),
    total_injured: Number(row.total_injured) || 0,
    total_deaths: Number(row.total_deaths) || 0,
  };
}

export interface TowRateBucket {
  bucket_label: string;
  total: number;
  towed: number;
  tow_rate: number;
}

export async function getTowRateByMileage(): Promise<TowRateBucket[]> {
  const rows = await query<{
    bucket_floor: string; bucket_label: string;
    total: string; towed: string;
  }>(`
    SELECT
      bucket_floor::text,
      bucket_label,
      COUNT(*)::text                                  AS total,
      SUM(vehicle_towed::int)::text                   AS towed
    FROM (
      SELECT
        vehicle_towed,
        CASE
          WHEN miles_at_failure < 5000 THEN 0
          WHEN miles_at_failure < 10000 THEN 5000
          WHEN miles_at_failure < 20000 THEN 10000
          WHEN miles_at_failure < 30000 THEN 20000
          WHEN miles_at_failure < 40000 THEN 30000
          WHEN miles_at_failure < 50000 THEN 40000
          WHEN miles_at_failure < 75000 THEN 50000
          ELSE 75000
        END                              AS bucket_floor,
        CASE
          WHEN miles_at_failure < 5000 THEN '0-5k'
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
        AND component ILIKE '%engine%'
        AND miles_at_failure IS NOT NULL
    ) bucketed
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
  return rows.map((r) => {
    const total = Number(r.total);
    const towed = Number(r.towed) || 0;
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

/**
 * Per-cohort comparison: for each (year, powertrain) cell, how many
 * trucks we observe on Carvana vs how many engine complaints exist.
 * NHTSA complaints are aggregated to the cohort because the 11-char
 * VIN prefix is enough to identify the cohort but not a specific truck.
 */
export async function getCohortFailures(): Promise<CohortFailureRow[]> {
  return query<CohortFailureRow>(`
    WITH our_cohort AS (
      SELECT model_year, is_hybrid, COUNT(*) AS carvana_count
        FROM vehicles
       WHERE engine_code ILIKE '%V35A%' AND model_year BETWEEN 2022 AND 2024
       GROUP BY model_year, is_hybrid
    ),
    nhtsa_cohort AS (
      SELECT model_year,
             COUNT(*)                                                          AS complaint_count,
             COUNT(*) FILTER (WHERE component ILIKE '%engine%')                AS engine_complaint_count,
             COUNT(*) FILTER (WHERE component ILIKE '%engine%' AND vehicle_towed) AS with_tow
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
    ORDER BY o.model_year, o.is_hybrid NULLS LAST
  `);
}

export interface FailureCurvePoint {
  bucket_floor: number;
  bucket_label: string;
  cumulative_failures: number;
  per_bucket: number;
}

// ── User submissions (community-reported engine replacements) ────────────

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
  const row = await queryOne<{
    total: string; total_verified: string;
    replacements: string; replacements_verified: string;
    median_replacement_mileage: string | null;
    earliest_replacement_mileage: string | null;
    latest_replacement_mileage: string | null;
    hybrid_replacements: string;
    nonhybrid_replacements: string;
    recall_replacements: string;
    non_recall_replacements: string;
    reports_with_tow: string;
  }>(`
    SELECT
      COUNT(*)::text                                                                     AS total,
      COUNT(*) FILTER (WHERE verified)::text                                             AS total_verified,
      COUNT(*) FILTER (WHERE engine_replaced)::text                                      AS replacements,
      COUNT(*) FILTER (WHERE engine_replaced AND verified)::text                         AS replacements_verified,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY replacement_mileage)
        FILTER (WHERE engine_replaced AND replacement_mileage IS NOT NULL)               AS median_replacement_mileage,
      MIN(replacement_mileage) FILTER (WHERE engine_replaced AND replacement_mileage > 0)::text AS earliest_replacement_mileage,
      MAX(replacement_mileage) FILTER (WHERE engine_replaced AND replacement_mileage > 0)::text AS latest_replacement_mileage,
      COUNT(*) FILTER (WHERE engine_replaced AND is_hybrid)::text                        AS hybrid_replacements,
      COUNT(*) FILTER (WHERE engine_replaced AND is_hybrid IS FALSE)::text               AS nonhybrid_replacements,
      COUNT(*) FILTER (WHERE engine_replaced AND under_recall)::text                     AS recall_replacements,
      COUNT(*) FILTER (WHERE engine_replaced AND under_recall IS FALSE)::text            AS non_recall_replacements,
      COUNT(*) FILTER (WHERE engine_replaced AND was_towed)::text                        AS reports_with_tow
    FROM user_submissions
    WHERE NOT honeypot_failed
  `);
  if (!row) {
    return {
      total: 0, total_verified: 0,
      replacements: 0, replacements_verified: 0,
      median_replacement_mileage: null,
      earliest_replacement_mileage: null,
      latest_replacement_mileage: null,
      hybrid_replacements: 0, nonhybrid_replacements: 0,
      recall_replacements: 0, non_recall_replacements: 0,
      reports_with_tow: 0,
    };
  }
  return {
    total: Number(row.total),
    total_verified: Number(row.total_verified),
    replacements: Number(row.replacements),
    replacements_verified: Number(row.replacements_verified),
    median_replacement_mileage: row.median_replacement_mileage
      ? Math.round(Number(row.median_replacement_mileage))
      : null,
    earliest_replacement_mileage: row.earliest_replacement_mileage
      ? Number(row.earliest_replacement_mileage)
      : null,
    latest_replacement_mileage: row.latest_replacement_mileage
      ? Number(row.latest_replacement_mileage)
      : null,
    hybrid_replacements: Number(row.hybrid_replacements),
    nonhybrid_replacements: Number(row.nonhybrid_replacements),
    recall_replacements: Number(row.recall_replacements),
    non_recall_replacements: Number(row.non_recall_replacements),
    reports_with_tow: Number(row.reports_with_tow),
  };
}

export interface UserReplacementRow {
  id: number;
  submitted_at: string;
  vin_prefix: string;       // first 11 chars; full VIN never sent to client
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

/**
 * Recent community-reported engine replacements. Returns 11-char VIN
 * prefix only — the full VIN stays on the server.
 */
export async function getRecentUserReplacements(limit = 25): Promise<UserReplacementRow[]> {
  return query<UserReplacementRow>(
    `SELECT
        id,
        submitted_at,
        LEFT(vin, 11)                              AS vin_prefix,
        model_year, trim, is_hybrid,
        replacement_date::text                     AS replacement_date,
        replacement_mileage, failure_mode, was_towed,
        under_recall, recall_campaign,
        dealer_state, notes,
        verified
      FROM user_submissions
      WHERE NOT honeypot_failed
        AND engine_replaced
      ORDER BY submitted_at DESC
      LIMIT $1`,
    [limit],
  );
}

export interface UserMileageBucket {
  bucket_floor: number;
  bucket_label: string;
  reports: number;
}

export async function getUserReplacementMileageHistogram(): Promise<UserMileageBucket[]> {
  const rows = await query<{
    bucket_floor: string; bucket_label: string; reports: string;
  }>(`
    SELECT bucket_floor::text, bucket_label, COUNT(*)::text AS reports
    FROM (
      SELECT
        CASE
          WHEN replacement_mileage < 5000 THEN 0
          WHEN replacement_mileage < 10000 THEN 5000
          WHEN replacement_mileage < 20000 THEN 10000
          WHEN replacement_mileage < 30000 THEN 20000
          WHEN replacement_mileage < 40000 THEN 30000
          WHEN replacement_mileage < 50000 THEN 40000
          WHEN replacement_mileage < 75000 THEN 50000
          WHEN replacement_mileage < 100000 THEN 75000
          ELSE 100000
        END AS bucket_floor,
        CASE
          WHEN replacement_mileage < 5000 THEN '0-5k'
          WHEN replacement_mileage < 10000 THEN '5-10k'
          WHEN replacement_mileage < 20000 THEN '10-20k'
          WHEN replacement_mileage < 30000 THEN '20-30k'
          WHEN replacement_mileage < 40000 THEN '30-40k'
          WHEN replacement_mileage < 50000 THEN '40-50k'
          WHEN replacement_mileage < 75000 THEN '50-75k'
          WHEN replacement_mileage < 100000 THEN '75-100k'
          ELSE '100k+'
        END AS bucket_label
      FROM user_submissions
      WHERE NOT honeypot_failed
        AND engine_replaced
        AND replacement_mileage IS NOT NULL
        AND replacement_mileage > 0
    ) bucketed
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
  return rows.map((r) => ({
    bucket_floor: Number(r.bucket_floor),
    bucket_label: r.bucket_label,
    reports: Number(r.reports),
  }));
}

export async function getCumulativeFailureCurve(): Promise<FailureCurvePoint[]> {
  // Per-bucket counts of engine complaints with mileage data
  const rows = await query<{ bucket_floor: string; bucket_label: string; per_bucket: string }>(`
    SELECT
      bucket_floor::text, bucket_label,
      COUNT(*)::text AS per_bucket
    FROM (
      SELECT
        CASE
          WHEN miles_at_failure < 5000 THEN 0
          WHEN miles_at_failure < 10000 THEN 5000
          WHEN miles_at_failure < 20000 THEN 10000
          WHEN miles_at_failure < 30000 THEN 20000
          WHEN miles_at_failure < 40000 THEN 30000
          WHEN miles_at_failure < 50000 THEN 40000
          WHEN miles_at_failure < 75000 THEN 50000
          ELSE 75000
        END AS bucket_floor,
        CASE
          WHEN miles_at_failure < 5000 THEN '0-5k'
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
        AND component ILIKE '%engine%'
        AND miles_at_failure IS NOT NULL
    ) b
    GROUP BY bucket_floor, bucket_label
    ORDER BY bucket_floor
  `);
  let running = 0;
  return rows.map((r) => {
    running += Number(r.per_bucket);
    return {
      bucket_floor: Number(r.bucket_floor),
      bucket_label: r.bucket_label,
      cumulative_failures: running,
      per_bucket: Number(r.per_bucket),
    };
  });
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
