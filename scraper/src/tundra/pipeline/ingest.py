"""Ingest a Carvana scrape JSON file (produced by tools/carvana-scrape.js)
into Postgres.

Pipeline per row:
  1. Validate VIN format
  2. Decode VIN via NHTSA vPIC (only if vehicles row missing engine_code or is_hybrid)
  3. Upsert vehicles row (first_seen_at preserved; last_seen_at bumped)
  4. Insert listing_observations row (always; lets us track price/mileage drift)
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from tundra.db import ListingObservation, Vehicle, session_scope
from tundra.vin import decode_many

VIN_PATTERN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")


@dataclass
class IngestStats:
    listings_seen: int = 0
    invalid_vins: int = 0
    new_vehicles: int = 0
    updated_vehicles: int = 0
    observations_inserted: int = 0
    vins_decoded: int = 0


def _payload_listings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    listings = payload.get("listings")
    if not isinstance(listings, list):
        raise ValueError("payload missing 'listings' array")
    return [row for row in listings if isinstance(row, dict)]


def _validate_vin(vin: Any) -> str | None:
    if not isinstance(vin, str):
        return None
    vin = vin.strip().upper()
    return vin if VIN_PATTERN.match(vin) else None


async def ingest_payload(payload: dict[str, Any], *, decode_inline: bool = False) -> IngestStats:
    """Ingest scraped listings into Postgres.

    By default vPIC decoding is *deferred* — scraping is fast and frequent;
    vPIC has aggressive per-IP rate limits. Set decode_inline=True only for
    small batches (sample VINs, ad-hoc tests). Otherwise run
    `tundra decode-vins` separately to backfill VIN-decoded fields.
    """
    stats = IngestStats()
    rows = _payload_listings(payload)
    stats.listings_seen = len(rows)

    cleaned: list[dict[str, Any]] = []
    for r in rows:
        vin = _validate_vin(r.get("vin"))
        if vin is None:
            stats.invalid_vins += 1
            continue
        r["vin"] = vin
        cleaned.append(r)

    if not cleaned:
        return stats

    now = datetime.now(UTC)

    with session_scope() as session:
        existing = {
            v.vin: v
            for v in session.execute(
                select(Vehicle).where(Vehicle.vin.in_([r["vin"] for r in cleaned]))
            ).scalars()
        }

    decodes: dict[str, Any] = {}
    if decode_inline:
        vins_to_decode = [
            r["vin"] for r in cleaned
            if r["vin"] not in existing or existing[r["vin"]].engine_code is None
        ]
        if vins_to_decode:
            for d in await decode_many(vins_to_decode):
                decodes[d.vin] = d
                stats.vins_decoded += 1

    # Upsert vehicles + insert listing observations in one session
    with session_scope() as session:
        for r in cleaned:
            vin = r["vin"]
            decoded = decodes.get(vin)

            # vPIC is authoritative for VIN-derived fields (year, engine, hybrid,
            # drivetrain, body class). Listing-derived fields (trim, color) come
            # from the scrape because Carvana's listing data is more current
            # than vPIC for trim variants.
            vehicle_values = {
                "vin": vin,
                "model_year": (decoded.model_year if decoded else None) or r.get("model_year"),
                "trim": r.get("trim") or (decoded.trim if decoded else None),
                "body_style": (decoded.body_class if decoded else None) or r.get("body_style"),
                "drivetrain": (decoded.drive_type if decoded else None) or r.get("drivetrain"),
                "engine_code": (decoded.engine_model if decoded else None),
                "is_hybrid": (decoded.is_hybrid if decoded else None),
                "exterior_color": r.get("exterior_color"),
                "first_seen_at": now,
                "last_seen_at": now,
            }
            # Drop None values for fields we don't want to overwrite with null
            non_null = {k: v for k, v in vehicle_values.items() if v is not None}

            stmt = pg_insert(Vehicle).values(**vehicle_values)
            update_set = {
                "last_seen_at": now,
                **{k: stmt.excluded[k] for k in non_null if k not in {"vin", "first_seen_at"}},
            }
            stmt = stmt.on_conflict_do_update(index_elements=["vin"], set_=update_set)
            result = session.execute(stmt)

            if vin in existing:
                stats.updated_vehicles += 1
            else:
                stats.new_vehicles += 1

            session.add(
                ListingObservation(
                    vin=vin,
                    source="carvana",
                    source_listing_id=r.get("listing_id"),
                    url=r.get("listing_url"),
                    mileage=r.get("mileage"),
                    asking_price_usd=r.get("asking_price_usd"),
                    observed_at=now,
                    raw_payload=r,
                )
            )
            stats.observations_inserted += 1

    return stats


async def ingest_file(path: Path) -> IngestStats:
    """Ingest a bookmarklet JSON or a Chrome DevTools HAR capture."""
    p = Path(path)
    if p.suffix.lower() == ".har":
        from tundra.carvana import har_to_payload
        payload = har_to_payload(p)
    else:
        payload = json.loads(p.read_text())
    return await ingest_payload(payload)
