"""Ingest NHTSA's FLAT_CMPL.txt complaints flat file.

Format reference: https://static.nhtsa.gov/odi/ffdd/cmpl/CMPL.txt
- Tab-delimited, 51 fields per row (as of 2026-04-30)
- Free-text fields can contain embedded newlines but never embedded tabs.
- Date format: YYYYMMDD as a string. "00000000" appears occasionally for unknown.

We filter aggressively to Toyota Tundra MY 2022+ to avoid pulling all 1.6 GB
into Postgres — only ~1750 rows of interest, plus we could expand to other
makes / models later.
"""
from __future__ import annotations

import csv
import io
import logging
import urllib.request
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text

from tundra.db import session_scope

NHTSA_FLAT_CMPL_URL = "https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "tundra-tracker" / "nhtsa"

# Field index → name (1-indexed in the spec, 0-indexed here for slicing)
FIELDS = (
    "cmplid", "odino", "mfr_name", "maketxt", "modeltxt", "yeartxt", "crash",
    "faildate", "fire", "injured", "deaths", "compdesc", "city", "state", "vin",
    "datea", "ldate", "miles", "occurrences", "cdescr", "cmpl_type",
    "police_rpt_yn", "purch_dt", "orig_owner_yn", "anti_brakes_yn",
    "cruise_cont_yn", "num_cyls", "drive_train", "fuel_sys", "fuel_type",
    "trans_type", "veh_speed", "dot", "tire_size", "loc_of_tire",
    "tire_fail_type", "orig_equip_yn", "manuf_dt", "seat_type",
    "restraint_type", "dealer_name", "dealer_tel", "dealer_city",
    "dealer_state", "dealer_zip", "prod_type", "repaired_yn", "medical_attn",
    "vehicles_towed_yn", "state_of_incident", "vehicle_operator",
)


def _parse_date(s: str) -> date | None:
    s = (s or "").strip()
    if not s or s == "00000000" or len(s) != 8:
        return None
    try:
        return datetime.strptime(s, "%Y%m%d").date()
    except ValueError:
        return None


def _parse_int(s: str) -> int | None:
    s = (s or "").strip()
    if not s or s == "0":
        # NHTSA writes "0" for both "zero" and "unknown" depending on field.
        # For miles, treat 0 as missing; for injured/deaths, treat as actual zero.
        return 0
    try:
        return int(s)
    except ValueError:
        return None


def _parse_yn(s: str) -> bool | None:
    s = (s or "").strip().upper()
    if s == "Y":
        return True
    if s == "N":
        return False
    return None


def download_flat_cmpl(cache_dir: Path | None = None, force: bool = False) -> Path:
    """Download FLAT_CMPL.zip if not cached, return the path to the extracted txt."""
    cache = cache_dir or DEFAULT_CACHE_DIR
    cache.mkdir(parents=True, exist_ok=True)
    zip_path = cache / "FLAT_CMPL.zip"
    txt_path = cache / "FLAT_CMPL.txt"

    if force or not zip_path.exists():
        logging.info(f"downloading {NHTSA_FLAT_CMPL_URL}")
        urllib.request.urlretrieve(NHTSA_FLAT_CMPL_URL, zip_path)

    if force or not txt_path.exists() or txt_path.stat().st_mtime < zip_path.stat().st_mtime:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(cache)

    return txt_path


def iter_flat_cmpl_rows(
    txt_path: Path,
    *,
    make: str | None = "TOYOTA",
    model: str | None = "TUNDRA",
    model_year_min: int | None = 2022,
    model_year_max: int | None = None,
) -> Iterator[dict[str, Any]]:
    """Stream rows from FLAT_CMPL.txt, filtered. Tab-delimited, no header."""
    # The file may have CRs from Windows-style line endings inside descriptions
    # — csv.reader with dialect='excel-tab' handles that as long as there are
    # no embedded tabs (which the spec guarantees).
    with open(txt_path, encoding="latin-1", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        for row in reader:
            if len(row) < len(FIELDS):
                # Pad to expected length so older rows that predate fields 50-51
                # still work
                row = row + [""] * (len(FIELDS) - len(row))
            rec = dict(zip(FIELDS, row, strict=False))
            if make and rec["maketxt"].upper() != make.upper():
                continue
            if model and rec["modeltxt"].upper() != model.upper():
                continue
            try:
                yr = int(rec["yeartxt"])
            except ValueError:
                continue
            if model_year_min and yr < model_year_min:
                continue
            if model_year_max and yr > model_year_max:
                continue
            yield rec


def ingest_flat_cmpl(
    txt_path: Path,
    *,
    model_year_min: int = 2022,
    model_year_max: int | None = None,
) -> dict[str, int]:
    """Ingest filtered rows into nhtsa_complaints. Idempotent on cmplid."""
    stats = {"seen": 0, "inserted": 0, "skipped": 0}
    rows_to_insert: list[dict[str, Any]] = []

    for rec in iter_flat_cmpl_rows(txt_path, model_year_min=model_year_min, model_year_max=model_year_max):
        stats["seen"] += 1
        miles = _parse_int(rec["miles"])
        try:
            year = int(rec["yeartxt"])
        except ValueError:
            year = None
        rows_to_insert.append({
            "cmplid": rec["cmplid"].strip(),
            "odino": rec["odino"].strip(),
            "manufacturer": rec["mfr_name"].strip() or None,
            "make": rec["maketxt"].strip() or None,
            "model": rec["modeltxt"].strip() or None,
            "model_year": year,
            "vin_prefix": (rec["vin"] or "").strip()[:11] or None,
            "fail_date": _parse_date(rec["faildate"]),
            "date_received": _parse_date(rec["ldate"]),
            "date_added": _parse_date(rec["datea"]),
            "miles_at_failure": miles if miles and miles > 0 else None,
            "crash": _parse_yn(rec["crash"]),
            "fire": _parse_yn(rec["fire"]),
            "vehicle_towed": _parse_yn(rec["vehicles_towed_yn"]),
            "num_injured": _parse_int(rec["injured"]) or 0,
            "num_deaths": _parse_int(rec["deaths"]) or 0,
            "component": rec["compdesc"].strip() or None,
            "description": (rec["cdescr"] or "").strip() or None,
            "city": rec["city"].strip() or None,
            "state": (rec["state"] or "").strip()[:2] or None,
            "complaint_type": (rec["cmpl_type"] or "").strip()[:8] or None,
        })

    if not rows_to_insert:
        return stats

    now = datetime.now(UTC)
    with session_scope() as session:
        # Upsert in batches of 500
        for i in range(0, len(rows_to_insert), 500):
            batch = rows_to_insert[i : i + 500]
            session.execute(
                text("""
                    INSERT INTO nhtsa_complaints
                      (cmplid, odino, manufacturer, make, model, model_year,
                       vin_prefix, fail_date, date_received, date_added,
                       miles_at_failure, crash, fire, vehicle_towed,
                       num_injured, num_deaths, component, description,
                       city, state, complaint_type, ingested_at)
                    VALUES
                      (:cmplid, :odino, :manufacturer, :make, :model, :model_year,
                       :vin_prefix, :fail_date, :date_received, :date_added,
                       :miles_at_failure, :crash, :fire, :vehicle_towed,
                       :num_injured, :num_deaths, :component, :description,
                       :city, :state, :complaint_type, :ingested_at)
                    ON CONFLICT (cmplid) DO UPDATE SET
                       miles_at_failure = EXCLUDED.miles_at_failure,
                       description = EXCLUDED.description,
                       component = EXCLUDED.component,
                       fail_date = EXCLUDED.fail_date,
                       ingested_at = EXCLUDED.ingested_at
                """),
                [{**row, "ingested_at": now} for row in batch],
            )
            stats["inserted"] += len(batch)

    return stats
