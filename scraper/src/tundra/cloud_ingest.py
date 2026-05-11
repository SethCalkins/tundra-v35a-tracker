"""Push local Postgres state to the Cloudflare D1-backed /api/ingest endpoint.

Used by the GitHub Actions cron workflow. The scraper still uses Postgres
locally for ergonomic SQLAlchemy-driven writes during the run; this module
reads the resulting rows and replays them into D1 as JSON batches.

Auth: bearer token via the INGEST_SECRET env var.
Target: INGEST_URL env var (e.g. https://tundra-v35a-tracker.workers.dev/api/ingest).
"""
from __future__ import annotations

import datetime as dt
import json
import os
from collections.abc import Iterable
from typing import Any

import httpx
from sqlalchemy import text

from tundra.db.session import session_scope

# How many rows per HTTP batch. Keep moderate — Workers have ~10MB request
# body limits and D1.batch() works best on dozens-to-hundreds of statements.
BATCH = 200
BATCH_OVERRIDES = {
    "observations": 50,            # raw_payload JSON blobs are large
    "carfax_observations": 50,
    "nhtsa_complaints": 50,
    "recall_documents": 3,         # PDF bodies can be 60KB+
}

# Map of D1 ingest-payload key → (SQL table, columns to send).
SOURCES: dict[str, tuple[str, list[str]]] = {
    "vehicles": ("vehicles", [
        "vin", "model_year", "trim", "body_style", "drivetrain", "engine_code",
        "is_hybrid", "exterior_color", "first_seen_at", "last_seen_at",
    ]),
    "observations": ("listing_observations", [
        "vin", "source", "source_listing_id", "url", "mileage",
        "asking_price_usd", "observed_at", "raw_payload",
    ]),
    "recall_status": ("recall_status", [
        "vin", "recall_id", "status", "source", "checked_at",
    ]),
    "recall_status_events": ("recall_status_events", [
        "vin", "recall_id", "prev_status", "new_status", "observed_at",
    ]),
    "carfax_observations": ("carfax_observations", [
        "vin", "observed_at", "owner_count", "accident_free", "open_recall_count",
        "engine_recall_listed", "engine_recall_status", "engine_replaced",
        "engine_replaced_date", "engine_replaced_miles", "recalls",
        "service_events", "raw_body_size", "source",
    ]),
    "nhtsa_complaints": ("nhtsa_complaints", [
        "cmplid", "odino", "manufacturer", "make", "model", "model_year",
        "vin_prefix", "fail_date", "date_received", "date_added",
        "miles_at_failure", "crash", "fire", "vehicle_towed", "num_injured",
        "num_deaths", "component", "description", "city", "state",
        "complaint_type", "source", "ingested_at",
    ]),
    "recall_quarterly_reports": ("recall_quarterly_reports", [
        "recall_id", "mfr_name", "mfr_campaign", "subject",
        "owner_notify_start", "owner_notify_end",
        "report_no", "quarter",
        "involved", "total_remedied", "total_unreachable", "total_removed",
        "submission_date", "ingested_at",
    ]),
    "recall_documents": ("recall_documents", [
        "recall_id", "doc_type", "filename", "title", "submission_date",
        "source_url", "page_count", "body", "ingested_at",
    ]),
    "mfr_communications": ("mfr_communications", [
        "nhtsa_id", "make", "model", "model_years", "summary",
        "engine_keyword", "ingested_at",
    ]),
}


def _normalize(v: Any) -> Any:
    """JSON-serialize anything Postgres returns that json.dumps doesn't grok."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, dt.datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=dt.timezone.utc)
        return v.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return v  # let httpx json-encode natively
    return v


def _fetch_rows(table: str, cols: list[str]) -> list[dict[str, Any]]:
    with session_scope() as s:
        result = s.execute(text(f"SELECT {', '.join(cols)} FROM {table}")).mappings().all()
        return [{k: _normalize(r[k]) for k in cols} for r in result]


def _chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def sync(url: str, secret: str, *, dry_run: bool = False) -> dict[str, int]:
    """Read Postgres and POST batches to /api/ingest. Returns per-key totals."""
    totals: dict[str, int] = {}
    headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
    with httpx.Client(timeout=60.0) as client:
        for key, (table, cols) in SOURCES.items():
            rows = _fetch_rows(table, cols)
            if not rows:
                totals[key] = 0
                continue
            size = BATCH_OVERRIDES.get(key, BATCH)
            sent = 0
            for chunk in _chunks(rows, size):
                if dry_run:
                    sent += len(chunk)
                    continue
                r = client.post(url, headers=headers, content=json.dumps({key: chunk}, default=str))
                if r.status_code >= 400:
                    raise RuntimeError(f"ingest {key} failed [{r.status_code}]: {r.text[:300]}")
                sent += len(chunk)
            totals[key] = sent
            print(f"  {key:25} → {sent} rows")
    return totals


def sync_from_env(*, dry_run: bool = False) -> dict[str, int]:
    # Prefer Settings (loads from repo-root .env); fall back to bare os.environ
    # for the GH Actions case where secrets come through workflow env.
    from tundra.config import get_settings
    settings = get_settings()
    url = settings.ingest_url or os.environ.get("INGEST_URL")
    secret = settings.ingest_secret or os.environ.get("INGEST_SECRET")
    if not url or not secret:
        raise RuntimeError(
            "INGEST_URL and INGEST_SECRET must be set (in .env or process env)."
        )
    return sync(url, secret, dry_run=dry_run)


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    sync_from_env(dry_run=dry)
