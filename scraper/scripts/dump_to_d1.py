"""One-shot dump: Postgres → SQL files compatible with D1 (SQLite).

Produces sharded .sql files under dashboard/d1/seed/ so they can be applied
with:

    wrangler d1 execute tundra-v35a-tracker --remote --file=./d1/seed/01_vehicles.sql
    ...

Skips the `recalls` table — it's seeded by schema.sql.

Conversions:
  - timestamptz → ISO 8601 UTC string ('...T...Z')
  - date         → 'YYYY-MM-DD' string
  - bool         → 0/1 integer
  - JSONB        → compact JSON string (with single quotes doubled)
  - ARRAY        → compact JSON string
  - inet         → string
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import text

from tundra.db.session import session_scope

OUT_DIR = Path(__file__).resolve().parents[2] / "dashboard" / "d1" / "seed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Order matters for FK integrity if PRAGMA foreign_keys=ON.
TABLES: list[tuple[str, list[str]]] = [
    ("vehicles", [
        "vin", "model_year", "trim", "body_style", "drivetrain", "engine_code",
        "is_hybrid", "exterior_color", "first_seen_at", "last_seen_at",
    ]),
    ("listing_observations", [
        "id", "vin", "source", "source_listing_id", "url", "mileage",
        "asking_price_usd", "observed_at", "raw_payload",
    ]),
    ("recall_status", [
        "vin", "recall_id", "status", "source", "checked_at",
    ]),
    ("recall_status_events", [
        "id", "vin", "recall_id", "prev_status", "new_status", "observed_at",
    ]),
    ("carfax_observations", [
        "id", "vin", "observed_at", "owner_count", "accident_free",
        "open_recall_count", "engine_recall_listed", "engine_recall_status",
        "engine_replaced", "engine_replaced_date", "engine_replaced_miles",
        "recalls", "service_events", "raw_body_size", "source",
    ]),
    ("nhtsa_complaints", [
        "cmplid", "odino", "manufacturer", "make", "model", "model_year",
        "vin_prefix", "fail_date", "date_received", "date_added",
        "miles_at_failure", "crash", "fire", "vehicle_towed", "num_injured",
        "num_deaths", "component", "description", "city", "state",
        "complaint_type", "source", "ingested_at",
    ]),
    ("user_submissions", [
        "id", "submitted_at", "vin", "model_year", "trim", "is_hybrid",
        "current_mileage", "engine_replaced", "replacement_date",
        "replacement_mileage", "failure_mode", "was_towed", "dealer_name",
        "dealer_state", "under_recall", "recall_campaign", "verified",
        "verification_method", "verified_at", "notes", "submitter_email",
        "ip_address", "user_agent", "honeypot_failed",
    ]),
]

BATCH = 200  # default; tables with big JSON payloads override below

# Tables whose rows can be large (JSON blobs) — use smaller batches to stay
# under SQLite's ~1MB per-statement limit.
BATCH_OVERRIDES = {
    "listing_observations": 25,   # raw_payload (full Carvana listing JSON)
    "carfax_observations": 20,    # recalls + service_events JSON
    "nhtsa_complaints": 25,       # description free text can be long
}


def sqlite_lit(v: Any) -> str:
    """Convert a Python value to a SQLite literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, dt.datetime):
        # store as ISO 8601 UTC
        if v.tzinfo is None:
            v = v.replace(tzinfo=dt.timezone.utc)
        return "'" + v.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z") + "'"
    if isinstance(v, dt.date):
        return "'" + v.isoformat() + "'"
    if isinstance(v, (dict, list)):
        s = json.dumps(v, separators=(",", ":"), default=str)
        return "'" + s.replace("'", "''") + "'"
    s = str(v).replace("'", "''")
    return "'" + s + "'"


def dump_table(table: str, cols: list[str]) -> Path | None:
    out = OUT_DIR / f"{table}.sql"
    with session_scope() as s, out.open("w") as fh:
        rows = list(
            s.execute(text(f"SELECT {', '.join(cols)} FROM {table}")).mappings()
        )
        if not rows:
            print(f"  {table}: empty, skipping")
            return None
        cols_sql = ", ".join(cols)
        batch_size = BATCH_OVERRIDES.get(table, BATCH)
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            values_sql = ",\n  ".join(
                "(" + ", ".join(sqlite_lit(r[c]) for c in cols) + ")"
                for r in batch
            )
            fh.write(f"INSERT OR REPLACE INTO {table} ({cols_sql}) VALUES\n  {values_sql};\n")
        print(f"  {table}: {len(rows)} rows → {out.name}")
        return out


def main() -> None:
    print(f"Dumping → {OUT_DIR}")
    for table, cols in TABLES:
        dump_table(table, cols)


if __name__ == "__main__":
    main()
