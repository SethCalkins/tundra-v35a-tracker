"""Ingest the §573 PDFs Toyota filed with NHTSA for 24V381 / 25V767.

Strategy:
  1. Use any PDFs already present in `data/recall-docs/` (these were
     hand-curated when the project started).
  2. Try a small known-good list of additional S3 URLs (RCAK
     acknowledgements) that the bucket consistently exposes.
  3. Parse text via pypdf; store full body + metadata in the
     `recall_documents` table keyed by filename.

Idempotent: re-running just re-upserts on filename.
"""
from __future__ import annotations

import logging
import re
import urllib.request
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pypdf
from sqlalchemy import text

from tundra.db import session_scope

DEFAULT_DOC_DIR = Path(__file__).resolve().parents[4] / "data" / "recall-docs"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "tundra-tracker" / "nhtsa-docs"

# Additional documents to fetch beyond what's in data/recall-docs/.
# These are the consistently-listed acknowledgement files for our two recalls.
EXTRA_DOCS = [
    ("RCAK-24V381-9859.pdf", "https://static.nhtsa.gov/odi/rcl/2024/RCAK-24V381-9859.pdf"),
    ("RCAK-25V767-5381.pdf", "https://static.nhtsa.gov/odi/rcl/2025/RCAK-25V767-5381.pdf"),
]

DOC_TYPE_MAP = {
    "RCLRPT":  "573_report",
    "RCRIT":   "amendment",
    "RCLQRT":  "quarterly_pdf",       # superseded by FLAT_RCL_Qrtly_Rpts feed
    "RCMN":    "manufacturer_letter",
    "RCAK":    "acknowledgement",
    "RMISC":   "misc",
    "RCDNN":   "decline_notice",
}

TITLE_MAP = {
    "573_report":         "§573 Safety Recall Report",
    "amendment":          "§573 Amendment / Chronology",
    "quarterly_pdf":      "Quarterly Recall Report",
    "manufacturer_letter":"Manufacturer Communication",
    "acknowledgement":    "NHTSA Acknowledgement",
    "misc":               "Miscellaneous filing",
    "decline_notice":     "Decline Notice",
}

# Filename pattern: PREFIX-CAMPAIGN-NNNN.pdf  (case-insensitive extension)
FNAME_RE = re.compile(r"^([A-Z]+)-(\d{2}V\d{3})(?:-\d+)*-(\d+)\.(pdf|PDF)$", re.IGNORECASE)


def _parse_meta(filename: str) -> tuple[str, str] | None:
    """Return (recall_id, doc_type) parsed from filename prefix."""
    m = FNAME_RE.match(filename)
    if not m:
        return None
    prefix = m.group(1).upper()
    recall_id = m.group(2).upper()
    return recall_id, DOC_TYPE_MAP.get(prefix, "other")


def _extract_pdf_text(path: Path) -> tuple[int, str]:
    """Returns (page_count, full_text). Empty if extraction fails."""
    try:
        reader = pypdf.PdfReader(str(path))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return len(reader.pages), text
    except Exception as e:
        logging.warning(f"PDF parse failed for {path}: {e}")
        return 0, ""


def _extract_submission_date(body: str) -> date | None:
    """Best-effort extraction of 'Submission Date: MMM DD, YYYY' from §573 bodies."""
    m = re.search(
        r"Submission\s+Date\s*[:\-]\s*([A-Za-z]{3,9})\s+(\d{1,2})\s*,\s*(\d{4})",
        body,
    )
    if not m:
        return None
    month_str, day, year = m.group(1), int(m.group(2)), int(m.group(3))
    try:
        return datetime.strptime(f"{month_str[:3]} {day} {year}", "%b %d %Y").date()
    except ValueError:
        return None


def _ensure_cached(filename: str, url: str, cache_dir: Path) -> Path:
    """Download `url` to `cache_dir/filename` if not present. Return path."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    p = cache_dir / filename
    if not p.exists():
        logging.info(f"downloading {url}")
        urllib.request.urlretrieve(url, p)
    return p


def collect_pdfs(
    doc_dir: Path | None = None,
    cache_dir: Path | None = None,
) -> list[tuple[Path, str | None]]:
    """Return (path, source_url) pairs for every PDF we want to ingest."""
    doc_dir = doc_dir or DEFAULT_DOC_DIR
    cache_dir = cache_dir or DEFAULT_CACHE_DIR

    paths: list[tuple[Path, str | None]] = []
    if doc_dir.exists():
        for p in sorted(doc_dir.glob("*.pdf")) + sorted(doc_dir.glob("*.PDF")):
            # Reconstruct the canonical NHTSA URL from the filename's year prefix.
            recall_year_prefix = re.match(r"^[A-Z]+-(\d{2})V", p.name, re.IGNORECASE)
            if recall_year_prefix:
                year_chunk = recall_year_prefix.group(1)
                yr_full = f"20{year_chunk}"
                source = f"https://static.nhtsa.gov/odi/rcl/{yr_full}/{p.name}"
            else:
                source = None
            paths.append((p, source))

    have = {p.name for p, _ in paths}
    for fname, url in EXTRA_DOCS:
        if fname in have:
            continue
        try:
            p = _ensure_cached(fname, url, cache_dir)
            paths.append((p, url))
        except Exception as e:
            logging.warning(f"could not fetch {fname}: {e}")

    return paths


def ingest(
    doc_dir: Path | None = None,
    cache_dir: Path | None = None,
) -> dict[str, int]:
    """Parse + upsert every available recall PDF. Idempotent on filename."""
    stats = {"seen": 0, "ingested": 0, "skipped": 0}
    now = datetime.now(UTC)
    rows: list[dict[str, Any]] = []

    for p, source_url in collect_pdfs(doc_dir, cache_dir):
        stats["seen"] += 1
        meta = _parse_meta(p.name)
        if not meta:
            stats["skipped"] += 1
            continue
        recall_id, doc_type = meta
        pages, body = _extract_pdf_text(p)
        rows.append({
            "recall_id":       recall_id,
            "doc_type":        doc_type,
            "filename":        p.name,
            "title":           TITLE_MAP.get(doc_type, "Filing"),
            "submission_date": _extract_submission_date(body),
            "source_url":      source_url,
            "page_count":      pages,
            "body":            body,
        })

    if not rows:
        return stats

    with session_scope() as session:
        session.execute(
            text("""
                INSERT INTO recall_documents
                  (recall_id, doc_type, filename, title, submission_date,
                   source_url, page_count, body, ingested_at)
                VALUES
                  (:recall_id, :doc_type, :filename, :title, :submission_date,
                   :source_url, :page_count, :body, :ingested_at)
                ON CONFLICT (filename) DO UPDATE SET
                  body            = EXCLUDED.body,
                  page_count      = EXCLUDED.page_count,
                  submission_date = EXCLUDED.submission_date,
                  source_url      = COALESCE(recall_documents.source_url, EXCLUDED.source_url),
                  ingested_at     = EXCLUDED.ingested_at
            """),
            [{**r, "ingested_at": now} for r in rows],
        )
        stats["ingested"] = len(rows)
    return stats
