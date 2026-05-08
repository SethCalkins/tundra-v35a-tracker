"""Backfill VIN-decode data from NHTSA vPIC for vehicles missing it.

Decoupled from `ingest_payload` so scraping stays fast — vPIC has tight
per-IP rate limits (403 / 429 after a burst) but is plenty fast at the
gentler cadence we want for an overnight backfill.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import select, update

from tundra.db import Vehicle, session_scope
from tundra.vin import VinDecode, decode_many


@dataclass
class DecodeStats:
    candidates: int = 0
    decoded_ok: int = 0
    decoded_failed: int = 0
    rows_updated: int = 0


def _candidate_query():
    """Vehicles missing engine_code (proxy for 'never decoded')."""
    return select(Vehicle.vin).where(Vehicle.engine_code.is_(None))


def candidate_vins() -> list[str]:
    with session_scope() as session:
        return [row[0] for row in session.execute(_candidate_query())]


async def backfill_decodes(
    *,
    limit: int | None = None,
    concurrency: int = 2,
    delay_seconds: float = 0.5,
) -> DecodeStats:
    stats = DecodeStats()
    vins = candidate_vins()
    if limit is not None:
        vins = vins[:limit]
    stats.candidates = len(vins)
    if not vins:
        return stats

    decodes: list[VinDecode] = await decode_many(
        vins, concurrency=concurrency, delay_seconds=delay_seconds
    )

    by_vin: dict[str, VinDecode] = {}
    for d in decodes:
        if d.engine_model is not None or d.model_year is not None:
            by_vin[d.vin] = d
            stats.decoded_ok += 1
        else:
            stats.decoded_failed += 1

    if not by_vin:
        return stats

    with session_scope() as session:
        for vin, d in by_vin.items():
            updates: dict[str, object] = {}
            if d.model_year is not None:
                updates["model_year"] = d.model_year
            if d.engine_model is not None:
                updates["engine_code"] = d.engine_model
            if d.is_hybrid is not None:
                updates["is_hybrid"] = d.is_hybrid
            if d.drive_type is not None:
                updates["drivetrain"] = d.drive_type
            if d.body_class is not None:
                updates["body_style"] = d.body_class
            if d.trim is not None:
                # Only fill trim if it's currently None — scrape's trim is more
                # specific than vPIC's
                trim_row = session.execute(
                    select(Vehicle.trim).where(Vehicle.vin == vin)
                ).scalar()
                if trim_row is None:
                    updates["trim"] = d.trim
            if updates:
                session.execute(
                    update(Vehicle).where(Vehicle.vin == vin).values(**updates)
                )
                stats.rows_updated += 1

    return stats
