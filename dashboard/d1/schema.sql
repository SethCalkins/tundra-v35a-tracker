-- D1 (SQLite) schema for tundra-v35a-tracker.
-- Folded from scraper/alembic/versions/0001..0007.
--
-- Postgres → SQLite type mapping:
--   TIMESTAMP(timezone=True)  → TEXT  (ISO 8601 UTC, e.g. '2026-05-11T14:08:05.487Z')
--   DATE                      → TEXT  ('YYYY-MM-DD')
--   JSONB                     → TEXT  (JSON string, queried with json_extract / json_each)
--   ARRAY                     → TEXT  (JSON array string, queried with json_each)
--   BOOLEAN                   → INTEGER (0/1)
--   BIGINT autoincrement      → INTEGER PRIMARY KEY AUTOINCREMENT
--   INET                      → TEXT
--
-- Run with:
--   wrangler d1 execute tundra-v35a-tracker --remote --file=./d1/schema.sql

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- vehicles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  vin             TEXT PRIMARY KEY,
  model_year      INTEGER NOT NULL,
  trim            TEXT,
  body_style      TEXT,
  drivetrain      TEXT,
  engine_code     TEXT,
  is_hybrid       INTEGER,
  exterior_color  TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- listing_observations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_observations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  vin                TEXT NOT NULL REFERENCES vehicles(vin),
  source             TEXT NOT NULL DEFAULT 'carvana',
  source_listing_id  TEXT,
  url                TEXT,
  mileage            INTEGER,
  asking_price_usd   INTEGER,
  observed_at        TEXT NOT NULL,
  raw_payload        TEXT
);
CREATE INDEX IF NOT EXISTS ix_listing_observations_vin_observed_at
  ON listing_observations (vin, observed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- recalls (note: potentially_involved added in 0004; merged here)
-- affected_years / affected_models stored as JSON arrays.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recalls (
  id                    TEXT PRIMARY KEY,
  toyota_campaign       TEXT,
  description           TEXT,
  affected_years        TEXT NOT NULL,    -- JSON: '[2022,2023]'
  affected_models       TEXT NOT NULL,    -- JSON: '["Tundra","LX600"]'
  build_start_date      TEXT,
  build_end_date        TEXT,
  potentially_involved  INTEGER
);

-- ─────────────────────────────────────────────────────────────
-- recall_status
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recall_status (
  vin         TEXT NOT NULL REFERENCES vehicles(vin),
  recall_id   TEXT NOT NULL REFERENCES recalls(id),
  status      TEXT NOT NULL,
  source      TEXT NOT NULL,
  checked_at  TEXT NOT NULL,
  PRIMARY KEY (vin, recall_id)
);

-- ─────────────────────────────────────────────────────────────
-- recall_status_events
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recall_status_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vin           TEXT NOT NULL,
  recall_id     TEXT NOT NULL,
  prev_status   TEXT,
  new_status    TEXT NOT NULL,
  observed_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_recall_status_events_recall_status_observed
  ON recall_status_events (recall_id, new_status, observed_at);

-- ─────────────────────────────────────────────────────────────
-- carfax_observations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carfax_observations (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  vin                      TEXT NOT NULL REFERENCES vehicles(vin),
  observed_at              TEXT NOT NULL,
  owner_count              INTEGER,
  accident_free            INTEGER,
  open_recall_count        INTEGER,
  engine_recall_listed     INTEGER,
  engine_recall_status     TEXT,
  engine_replaced          INTEGER,
  engine_replaced_date     TEXT,
  engine_replaced_miles    INTEGER,
  recalls                  TEXT,    -- JSON
  service_events           TEXT,    -- JSON
  raw_body_size            INTEGER,
  source                   TEXT NOT NULL DEFAULT 'carfax_partner_cvn0'
);
CREATE INDEX IF NOT EXISTS ix_carfax_obs_vin_observed
  ON carfax_observations (vin, observed_at);

-- ─────────────────────────────────────────────────────────────
-- nhtsa_complaints
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nhtsa_complaints (
  cmplid            TEXT PRIMARY KEY,
  odino             TEXT NOT NULL,
  manufacturer      TEXT,
  make              TEXT,
  model             TEXT,
  model_year        INTEGER,
  vin_prefix        TEXT,
  fail_date         TEXT,
  date_received     TEXT,
  date_added        TEXT,
  miles_at_failure  INTEGER,
  crash             INTEGER,
  fire              INTEGER,
  vehicle_towed     INTEGER,
  num_injured       INTEGER,
  num_deaths        INTEGER,
  component         TEXT,
  description       TEXT,
  city              TEXT,
  state             TEXT,
  complaint_type    TEXT,
  source            TEXT NOT NULL DEFAULT 'nhtsa_flat_cmpl',
  ingested_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_nhtsa_make_model_year
  ON nhtsa_complaints (make, model, model_year);
CREATE INDEX IF NOT EXISTS ix_nhtsa_vin_prefix
  ON nhtsa_complaints (vin_prefix);
CREATE INDEX IF NOT EXISTS ix_nhtsa_fail_date
  ON nhtsa_complaints (fail_date);

-- ─────────────────────────────────────────────────────────────
-- user_submissions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_submissions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at          TEXT NOT NULL,
  vin                   TEXT NOT NULL,
  model_year            INTEGER,
  trim                  TEXT,
  is_hybrid             INTEGER,
  current_mileage       INTEGER,
  engine_replaced       INTEGER NOT NULL,
  replacement_date      TEXT,
  replacement_mileage   INTEGER,
  failure_mode          TEXT,
  was_towed             INTEGER,
  dealer_name           TEXT,
  dealer_state          TEXT,
  under_recall          INTEGER,
  recall_campaign       TEXT,
  verified              INTEGER NOT NULL DEFAULT 0,
  verification_method   TEXT,
  verified_at           TEXT,
  notes                 TEXT,
  submitter_email       TEXT,
  ip_address            TEXT,
  user_agent            TEXT,
  honeypot_failed       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_user_subs_vin       ON user_submissions (vin);
CREATE INDEX IF NOT EXISTS ix_user_subs_verified  ON user_submissions (verified);
CREATE INDEX IF NOT EXISTS ix_user_subs_submitted ON user_submissions (submitted_at);

-- ─────────────────────────────────────────────────────────────
-- recall_quarterly_reports — NHTSA FLAT_RCL_Qrtly_Rpts ingest.
-- One row per (recall_id, quarter). Tracks cumulative remedy progress.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recall_quarterly_reports (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  recall_id            TEXT NOT NULL,
  mfr_name             TEXT,
  mfr_campaign         TEXT,
  subject              TEXT,
  owner_notify_start   TEXT,
  owner_notify_end     TEXT,
  report_no            INTEGER,
  quarter              TEXT NOT NULL,
  involved             INTEGER,
  total_remedied       INTEGER,
  total_unreachable    INTEGER,
  total_removed        INTEGER,
  submission_date      TEXT,
  ingested_at          TEXT NOT NULL,
  UNIQUE (recall_id, quarter)
);
CREATE INDEX IF NOT EXISTS ix_recall_qtrly_recall_quarter
  ON recall_quarterly_reports (recall_id, quarter);

-- ─────────────────────────────────────────────────────────────
-- recall_documents — Toyota's filed §573 PDFs (text-extracted).
-- One row per NHTSA filing; body = full PDF text.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recall_documents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  recall_id        TEXT NOT NULL,
  doc_type         TEXT NOT NULL,
  filename         TEXT NOT NULL UNIQUE,
  title            TEXT,
  submission_date  TEXT,
  source_url       TEXT,
  page_count       INTEGER,
  body             TEXT,
  ingested_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_recall_docs_recall_date
  ON recall_documents (recall_id, submission_date);

-- ─────────────────────────────────────────────────────────────
-- seed recalls (24V381 + 25V767 with build windows from 573 reports)
-- ─────────────────────────────────────────────────────────────
INSERT OR REPLACE INTO recalls
  (id, toyota_campaign, description, affected_years, affected_models, build_start_date, build_end_date, potentially_involved)
VALUES
  ('24V381',
   '24TA07',
   'V35A engine main bearing manufacturing debris. Remedy: engine assembly replacement (active since December 2024). Covers 2022-2023 Tundra and Lexus LX600.',
   '[2022,2023]',
   '["Tundra","LX600"]',
   '2021-11-02',
   '2023-02-13',
   102092),
  ('25V767',
   '25TA14',
   'V35A engine main bearing manufacturing debris (expansion of 24V381). Covers 2022-2024 Tundra, Lexus LX, 2024 Lexus GX. Remedy under development; final remedy anticipated July/August 2026.',
   '[2022,2023,2024]',
   '["Tundra","LX","GX"]',
   '2021-11-22',
   '2024-02-14',
   113079);
