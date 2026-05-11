"""Ingest NHTSA's FLAT_RCL_Qrtly_Rpts.txt — quarterly recall remedy filings.

Source: https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_Qrtly_Rpts.zip
Data dict: https://static.nhtsa.gov/odi/ffdd/rcl/RCL_Qtrly_Rpts.txt

Per-quarter snapshots from manufacturer §573 filings: for each open recall,
how many of the involved population have been remedied / are unreachable /
have been removed from service. Filed within 30 days of each calendar
quarter close.

Schema (TAB-delimited, no header):
  1. MFGTXT       — Manufacturer name
  2. CAMPNO       — NHTSA campaign number (e.g. "24V381000")
  3. MFGCAMPNO    — Manufacturer campaign number(s), comma-separated
  4. RCLSUBJ      — Recall subject line
  5. ODATE        — Owner-notification begin date (YYYYMMDD)
  6. ODATEEND     — Owner-notification end date (YYYYMMDD)
  7. RPTNO        — Sequential report number (1, 2, 3, … per recall)
  8. RPTQTR       — Reporting quarter "YYYY-Q"
  9. INVOLVED     — Total involved population
  10. TTLREMEDIED — Cumulative remedied count
  11. TTLUNREACH  — Cumulative unreachable count
  12. TTLREMOVED  — Cumulative removed from service
  13. SUBMDATE    — Submission date (YYYYMMDD)
"""
from __future__ import annotations

import csv
import logging
import urllib.request
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text

from tundra.db import session_scope

URL = "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_Qrtly_Rpts.zip"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "tundra-tracker" / "nhtsa"

FIELDS = (
    "mfgtxt", "campno", "mfgcampno", "rclsubj",
    "odate", "odateend",
    "rptno", "rptqtr",
    "involved", "ttlremedied", "ttlunreach", "ttlremoved",
    "submdate",
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
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _normalize_campno(raw: str) -> str:
    """NHTSA appends '000' to campaign numbers in this file. Strip it so the
    value lines up with our existing `recalls.id` column ('24V381')."""
    s = (raw or "").strip().upper()
    if s.endswith("000") and len(s) > 6:
        return s[:-3]
    return s


def download(cache_dir: Path | None = None, force: bool = False) -> Path:
    cache = cache_dir or DEFAULT_CACHE_DIR
    cache.mkdir(parents=True, exist_ok=True)
    zip_path = cache / "FLAT_RCL_Qrtly_Rpts.zip"
    txt_path = cache / "FLAT_RCL_Qrtly_Rpts.txt"
    if force or not zip_path.exists():
        logging.info(f"downloading {URL}")
        urllib.request.urlretrieve(URL, zip_path)
    if force or not txt_path.exists() or txt_path.stat().st_mtime < zip_path.stat().st_mtime:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(cache)
    return txt_path


def iter_rows(txt_path: Path, *, campno_filter: set[str] | None = None) -> Iterator[dict[str, Any]]:
    """Stream rows from FLAT_RCL_Qrtly_Rpts.txt, optionally filtered by campaign."""
    with open(txt_path, encoding="latin-1", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        for row in reader:
            if len(row) < len(FIELDS):
                row = row + [""] * (len(FIELDS) - len(row))
            rec = dict(zip(FIELDS, row, strict=False))
            cn = _normalize_campno(rec["campno"])
            if campno_filter and cn not in campno_filter:
                continue
            rec["_campno_norm"] = cn
            yield rec


def ingest(
    txt_path: Path | None = None,
    *,
    campno_filter: set[str] | None = None,
) -> dict[str, int]:
    """Upsert quarterly-report rows. Idempotent on (recall_id, quarter)."""
    if txt_path is None:
        txt_path = download()
    if campno_filter is None:
        # Default to the V35A recalls we already track in `recalls`.
        campno_filter = {"24V381", "25V767"}

    stats = {"seen": 0, "upserted": 0}
    rows: list[dict[str, Any]] = []

    for rec in iter_rows(txt_path, campno_filter=campno_filter):
        stats["seen"] += 1
        rows.append({
            "recall_id":          rec["_campno_norm"],
            "mfr_name":           rec["mfgtxt"].strip() or None,
            "mfr_campaign":       rec["mfgcampno"].strip() or None,
            "subject":            rec["rclsubj"].strip() or None,
            "owner_notify_start": _parse_date(rec["odate"]),
            "owner_notify_end":   _parse_date(rec["odateend"]),
            "report_no":          _parse_int(rec["rptno"]),
            "quarter":            rec["rptqtr"].strip(),
            "involved":           _parse_int(rec["involved"]),
            "total_remedied":     _parse_int(rec["ttlremedied"]),
            "total_unreachable":  _parse_int(rec["ttlunreach"]),
            "total_removed":      _parse_int(rec["ttlremoved"]),
            "submission_date":    _parse_date(rec["submdate"]),
        })

    if not rows:
        return stats

    now = datetime.now(UTC)
    with session_scope() as session:
        session.execute(
            text("""
                INSERT INTO recall_quarterly_reports
                  (recall_id, mfr_name, mfr_campaign, subject,
                   owner_notify_start, owner_notify_end,
                   report_no, quarter,
                   involved, total_remedied, total_unreachable, total_removed,
                   submission_date, ingested_at)
                VALUES
                  (:recall_id, :mfr_name, :mfr_campaign, :subject,
                   :owner_notify_start, :owner_notify_end,
                   :report_no, :quarter,
                   :involved, :total_remedied, :total_unreachable, :total_removed,
                   :submission_date, :ingested_at)
                ON CONFLICT (recall_id, quarter) DO UPDATE SET
                   total_remedied    = EXCLUDED.total_remedied,
                   total_unreachable = EXCLUDED.total_unreachable,
                   total_removed     = EXCLUDED.total_removed,
                   submission_date   = EXCLUDED.submission_date,
                   ingested_at       = EXCLUDED.ingested_at
            """),
            [{**r, "ingested_at": now} for r in rows],
        )
        stats["upserted"] = len(rows)

    return stats
