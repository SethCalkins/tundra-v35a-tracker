/**
 * /api/ingest — write endpoint for the scraper (GitHub Actions).
 *
 * POST application/json with shape:
 *
 *   {
 *     "vehicles": [ Vehicle, ... ],
 *     "observations": [ Observation, ... ],
 *     "recall_status": [ RecallStatusRow, ... ],
 *     "recall_status_events": [ RecallStatusEvent, ... ],
 *     "carfax_observations": [ CarfaxObservation, ... ],
 *     "nhtsa_complaints": [ NhtsaComplaint, ... ]
 *   }
 *
 * All fields per-row are optional except primary-key columns. Booleans
 * may be `true`/`false`/null; the route normalizes to 0/1/null for D1.
 *
 * Auth: bearer token in the Authorization header that matches the
 * INGEST_SECRET binding. Configure with:
 *   wrangler secret put INGEST_SECRET
 */
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

interface IngestPayload {
  vehicles?: Json[];
  observations?: Json[];
  recall_status?: Json[];
  recall_status_events?: Json[];
  carfax_observations?: Json[];
  nhtsa_complaints?: Json[];
  recall_quarterly_reports?: Json[];
  recall_documents?: Json[];
  mfr_communications?: Json[];
}

function toIntBool(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v ? 1 : 0;
  if (typeof v === "string") {
    if (v === "true" || v === "1") return 1;
    if (v === "false" || v === "0") return 0;
  }
  return null;
}

function toJson(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function pick(row: Json, k: string): unknown {
  return row[k] ?? null;
}

export async function POST(req: Request) {
  const { env } = getCloudflareContext();
  const auth = req.headers.get("authorization") ?? "";
  const expected = (env as unknown as { INGEST_SECRET?: string }).INGEST_SECRET;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured on server" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: IngestPayload;
  try {
    payload = (await req.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const db = (env as Cloudflare.Env).DB;
  if (!db) {
    return NextResponse.json({ ok: false, error: "DB binding missing" }, { status: 500 });
  }

  const counts = {
    vehicles: 0,
    observations: 0,
    recall_status: 0,
    recall_status_events: 0,
    carfax_observations: 0,
    nhtsa_complaints: 0,
    recall_quarterly_reports: 0,
    recall_documents: 0,
    mfr_communications: 0,
  };

  try {
    // ─ vehicles ─────────────────────────────────────────────────
    if (payload.vehicles?.length) {
      const stmts = payload.vehicles.map((v) =>
        db
          .prepare(
            `INSERT INTO vehicles
              (vin, model_year, trim, body_style, drivetrain, engine_code,
               is_hybrid, exterior_color, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(vin) DO UPDATE SET
               model_year     = COALESCE(excluded.model_year,     vehicles.model_year),
               trim           = COALESCE(excluded.trim,           vehicles.trim),
               body_style     = COALESCE(excluded.body_style,     vehicles.body_style),
               drivetrain     = COALESCE(excluded.drivetrain,     vehicles.drivetrain),
               engine_code    = COALESCE(excluded.engine_code,    vehicles.engine_code),
               is_hybrid      = COALESCE(excluded.is_hybrid,      vehicles.is_hybrid),
               exterior_color = COALESCE(excluded.exterior_color, vehicles.exterior_color),
               first_seen_at  = MIN(vehicles.first_seen_at, excluded.first_seen_at),
               last_seen_at   = MAX(vehicles.last_seen_at,  excluded.last_seen_at)`,
          )
          .bind(
            pick(v, "vin"),
            pick(v, "model_year"),
            pick(v, "trim"),
            pick(v, "body_style"),
            pick(v, "drivetrain"),
            pick(v, "engine_code"),
            toIntBool(v.is_hybrid),
            pick(v, "exterior_color"),
            pick(v, "first_seen_at"),
            pick(v, "last_seen_at"),
          ),
      );
      await db.batch(stmts);
      counts.vehicles = stmts.length;
    }

    // ─ listing_observations ─────────────────────────────────────
    if (payload.observations?.length) {
      const stmts = payload.observations.map((o) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO listing_observations
              (vin, source, source_listing_id, url, mileage, asking_price_usd, observed_at, raw_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            pick(o, "vin"),
            pick(o, "source") ?? "carvana",
            pick(o, "source_listing_id"),
            pick(o, "url"),
            pick(o, "mileage"),
            pick(o, "asking_price_usd"),
            pick(o, "observed_at"),
            toJson(o.raw_payload),
          ),
      );
      await db.batch(stmts);
      counts.observations = stmts.length;
    }

    // ─ recall_status ────────────────────────────────────────────
    if (payload.recall_status?.length) {
      const stmts = payload.recall_status.map((r) =>
        db
          .prepare(
            `INSERT OR REPLACE INTO recall_status
              (vin, recall_id, status, source, checked_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            pick(r, "vin"),
            pick(r, "recall_id"),
            pick(r, "status"),
            pick(r, "source"),
            pick(r, "checked_at"),
          ),
      );
      await db.batch(stmts);
      counts.recall_status = stmts.length;
    }

    // ─ recall_status_events ─────────────────────────────────────
    if (payload.recall_status_events?.length) {
      const stmts = payload.recall_status_events.map((e) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO recall_status_events
              (vin, recall_id, prev_status, new_status, observed_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            pick(e, "vin"),
            pick(e, "recall_id"),
            pick(e, "prev_status"),
            pick(e, "new_status"),
            pick(e, "observed_at"),
          ),
      );
      await db.batch(stmts);
      counts.recall_status_events = stmts.length;
    }

    // ─ carfax_observations ──────────────────────────────────────
    if (payload.carfax_observations?.length) {
      const stmts = payload.carfax_observations.map((c) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO carfax_observations
              (vin, observed_at, owner_count, accident_free, open_recall_count,
               engine_recall_listed, engine_recall_status, engine_replaced,
               engine_replaced_date, engine_replaced_miles, recalls, service_events,
               raw_body_size, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            pick(c, "vin"),
            pick(c, "observed_at"),
            pick(c, "owner_count"),
            toIntBool(c.accident_free),
            pick(c, "open_recall_count"),
            toIntBool(c.engine_recall_listed),
            pick(c, "engine_recall_status"),
            toIntBool(c.engine_replaced),
            pick(c, "engine_replaced_date"),
            pick(c, "engine_replaced_miles"),
            toJson(c.recalls),
            toJson(c.service_events),
            pick(c, "raw_body_size"),
            pick(c, "source") ?? "carfax_partner_cvn0",
          ),
      );
      await db.batch(stmts);
      counts.carfax_observations = stmts.length;
    }

    // ─ nhtsa_complaints ─────────────────────────────────────────
    if (payload.nhtsa_complaints?.length) {
      const stmts = payload.nhtsa_complaints.map((n) =>
        db
          .prepare(
            `INSERT OR REPLACE INTO nhtsa_complaints
              (cmplid, odino, manufacturer, make, model, model_year, vin_prefix,
               fail_date, date_received, date_added, miles_at_failure,
               crash, fire, vehicle_towed, num_injured, num_deaths,
               component, description, city, state, complaint_type, source, ingested_at)
             VALUES (?, ?, ?, ?, ?, ?, ?,
                     ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            pick(n, "cmplid"),
            pick(n, "odino"),
            pick(n, "manufacturer"),
            pick(n, "make"),
            pick(n, "model"),
            pick(n, "model_year"),
            pick(n, "vin_prefix"),
            pick(n, "fail_date"),
            pick(n, "date_received"),
            pick(n, "date_added"),
            pick(n, "miles_at_failure"),
            toIntBool(n.crash),
            toIntBool(n.fire),
            toIntBool(n.vehicle_towed),
            pick(n, "num_injured"),
            pick(n, "num_deaths"),
            pick(n, "component"),
            pick(n, "description"),
            pick(n, "city"),
            pick(n, "state"),
            pick(n, "complaint_type"),
            pick(n, "source") ?? "nhtsa_flat_cmpl",
            pick(n, "ingested_at"),
          ),
      );
      await db.batch(stmts);
      counts.nhtsa_complaints = stmts.length;
    }

    // ─ recall_quarterly_reports ─────────────────────────────────
    if (payload.recall_quarterly_reports?.length) {
      const stmts = payload.recall_quarterly_reports.map((q) =>
        db
          .prepare(
            `INSERT INTO recall_quarterly_reports
              (recall_id, mfr_name, mfr_campaign, subject,
               owner_notify_start, owner_notify_end,
               report_no, quarter,
               involved, total_remedied, total_unreachable, total_removed,
               submission_date, ingested_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(recall_id, quarter) DO UPDATE SET
               total_remedied    = excluded.total_remedied,
               total_unreachable = excluded.total_unreachable,
               total_removed     = excluded.total_removed,
               submission_date   = excluded.submission_date,
               ingested_at       = excluded.ingested_at`,
          )
          .bind(
            pick(q, "recall_id"),
            pick(q, "mfr_name"),
            pick(q, "mfr_campaign"),
            pick(q, "subject"),
            pick(q, "owner_notify_start"),
            pick(q, "owner_notify_end"),
            pick(q, "report_no"),
            pick(q, "quarter"),
            pick(q, "involved"),
            pick(q, "total_remedied"),
            pick(q, "total_unreachable"),
            pick(q, "total_removed"),
            pick(q, "submission_date"),
            pick(q, "ingested_at"),
          ),
      );
      await db.batch(stmts);
      counts.recall_quarterly_reports = stmts.length;
    }

    // ─ recall_documents ─────────────────────────────────────────
    if (payload.recall_documents?.length) {
      const stmts = payload.recall_documents.map((d) =>
        db
          .prepare(
            `INSERT INTO recall_documents
              (recall_id, doc_type, filename, title, submission_date,
               source_url, page_count, body, ingested_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(filename) DO UPDATE SET
               body            = excluded.body,
               page_count      = excluded.page_count,
               submission_date = excluded.submission_date,
               source_url      = COALESCE(recall_documents.source_url, excluded.source_url),
               ingested_at     = excluded.ingested_at`,
          )
          .bind(
            pick(d, "recall_id"),
            pick(d, "doc_type"),
            pick(d, "filename"),
            pick(d, "title"),
            pick(d, "submission_date"),
            pick(d, "source_url"),
            pick(d, "page_count"),
            pick(d, "body"),
            pick(d, "ingested_at"),
          ),
      );
      await db.batch(stmts);
      counts.recall_documents = stmts.length;
    }

    // ─ mfr_communications ──────────────────────────────────────
    if (payload.mfr_communications?.length) {
      const stmts = payload.mfr_communications.map((m) =>
        db
          .prepare(
            `INSERT INTO mfr_communications
              (nhtsa_id, make, model, model_years, summary, engine_keyword, ingested_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(nhtsa_id) DO UPDATE SET
               summary        = excluded.summary,
               model_years    = excluded.model_years,
               engine_keyword = excluded.engine_keyword,
               ingested_at    = excluded.ingested_at`,
          )
          .bind(
            pick(m, "nhtsa_id"),
            pick(m, "make"),
            pick(m, "model"),
            pick(m, "model_years"),
            pick(m, "summary"),
            toIntBool(m.engine_keyword),
            pick(m, "ingested_at"),
          ),
      );
      await db.batch(stmts);
      counts.mfr_communications = stmts.length;
    }
  } catch (e) {
    console.error("ingest error", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message ?? "ingest failed", counts },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, counts });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST JSON with Bearer auth" });
}
