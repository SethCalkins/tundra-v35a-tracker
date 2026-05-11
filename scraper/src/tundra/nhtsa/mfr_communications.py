"""Ingest NHTSA Manufacturer Communications (TSBs) — the engine-failure
service-bulletin trail that predates the V35A recalls.

Source files (5-year chunks):
  https://static.nhtsa.gov/odi/ffdd/tsbs/MFR_COMMS_RECEIVED_2020-2024.zip
  https://static.nhtsa.gov/odi/ffdd/tsbs/MFR_COMMS_RECEIVED_2025-2026.zip

CSV columns:
  "TSB/Document ID", "Make", "Model", "Model Year", "Concise Summary"
  (Model Year may be a comma-separated list like "2022,2023,2024".)

We filter to Toyota Tundra MY 2022+ on ingest. The `engine_keyword` flag
is set when the summary mentions any V35A / main bearing / short block /
machining debris / engine assembly term — so the dashboard can highlight
the pre-recall trail without re-scanning text on each render.
"""
from __future__ import annotations

import csv
import logging
import re
import urllib.request
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text

from tundra.db import session_scope

URLS = [
    "https://static.nhtsa.gov/odi/ffdd/tsbs/MFR_COMMS_RECEIVED_2020-2024.zip",
    "https://static.nhtsa.gov/odi/ffdd/tsbs/MFR_COMMS_RECEIVED_2025-2026.zip",
]
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "tundra-tracker" / "nhtsa"

ENGINE_KEYWORDS = re.compile(
    r"V35A|main\s+bearing|short\s+block|machining\s+debris|engine\s+assembly|"
    r"engine\s+replac|connecting\s+rod|knock(?:ing)?|seized",
    re.IGNORECASE,
)


def _years_in(raw: str) -> set[int]:
    out: set[int] = set()
    for chunk in (raw or "").split(","):
        chunk = chunk.strip()
        if chunk.isdigit() and len(chunk) == 4:
            out.add(int(chunk))
    return out


def download_all(cache_dir: Path | None = None, force: bool = False) -> list[Path]:
    cache = cache_dir or DEFAULT_CACHE_DIR
    cache.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    for url in URLS:
        name = url.rsplit("/", 1)[-1]
        zip_path = cache / name
        if force or not zip_path.exists():
            logging.info(f"downloading {url}")
            urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            for member in zf.namelist():
                target = cache / member
                if force or not target.exists() or target.stat().st_mtime < zip_path.stat().st_mtime:
                    zf.extract(member, cache)
                extracted.append(target)
    return extracted


def iter_filtered(
    csv_paths: list[Path],
    *,
    make: str = "TOYOTA",
    model: str = "TUNDRA",
    min_year: int = 2022,
) -> Iterator[dict[str, Any]]:
    """Stream CSV rows filtered to (make, model) and at-least-one-year >= min_year."""
    seen_ids: set[str] = set()
    for path in csv_paths:
        with open(path, encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                nh_id = (row.get("TSB/Document ID") or "").strip()
                if not nh_id or nh_id in seen_ids:
                    continue
                if (row.get("Make") or "").strip().upper() != make.upper():
                    continue
                if (row.get("Model") or "").strip().upper() != model.upper():
                    continue
                years = _years_in(row.get("Model Year") or "")
                if not any(y >= min_year for y in years):
                    continue
                seen_ids.add(nh_id)
                yield {
                    "nhtsa_id":   nh_id,
                    "make":       row["Make"].strip(),
                    "model":      row["Model"].strip(),
                    "model_years": (row.get("Model Year") or "").strip(),
                    "summary":    (row.get("Concise Summary") or "").strip(),
                }


def ingest(
    csv_paths: list[Path] | None = None,
    *,
    min_year: int = 2022,
) -> dict[str, int]:
    """Upsert filtered rows. Idempotent on nhtsa_id."""
    if csv_paths is None:
        csv_paths = download_all()

    rows: list[dict[str, Any]] = []
    for rec in iter_filtered(csv_paths, min_year=min_year):
        rec["engine_keyword"] = bool(ENGINE_KEYWORDS.search(rec["summary"] or ""))
        rows.append(rec)

    if not rows:
        return {"seen": 0, "upserted": 0, "engine_kw": 0}

    now = datetime.now(UTC)
    with session_scope() as session:
        for i in range(0, len(rows), 200):
            batch = rows[i : i + 200]
            session.execute(
                text("""
                    INSERT INTO mfr_communications
                      (nhtsa_id, make, model, model_years, summary, engine_keyword, ingested_at)
                    VALUES
                      (:nhtsa_id, :make, :model, :model_years, :summary, :engine_keyword, :ingested_at)
                    ON CONFLICT (nhtsa_id) DO UPDATE SET
                      summary        = EXCLUDED.summary,
                      model_years    = EXCLUDED.model_years,
                      engine_keyword = EXCLUDED.engine_keyword,
                      ingested_at    = EXCLUDED.ingested_at
                """),
                [{**r, "ingested_at": now} for r in batch],
            )

    return {
        "seen": len(rows),
        "upserted": len(rows),
        "engine_kw": sum(1 for r in rows if r["engine_keyword"]),
    }
