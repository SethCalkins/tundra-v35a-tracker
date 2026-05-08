"""NHTSA vPIC VIN decoder.

Free public API at vpic.nhtsa.dot.gov — no auth, generous rate limits.
Empirically returns engine model, electrification level, drivetrain, trim,
body class, and model year for 3rd-gen Tundras.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json"


@dataclass(frozen=True)
class VinDecode:
    vin: str
    make: str | None
    model: str | None
    model_year: int | None
    trim: str | None
    series: str | None
    body_class: str | None
    drive_type: str | None
    engine_model: str | None
    fuel_type_primary: str | None
    electrification_level: str | None
    raw: dict[str, Any] = field(repr=False)

    @property
    def is_hybrid(self) -> bool | None:
        """True for i-FORCE MAX, False for non-hybrid, None only if signals are missing.

        Detection chain:
          1. If electrification_level says HEV/PHEV/BEV/Hybrid → True
          2. If electrification_level says 'none' / 'not applicable' → False
          3. If engine_model contains '1TM' (Toyota's hybrid drive-motor code) → True
          4. If engine_model is populated without '1TM' → False
          5. Otherwise → None (truly unknown)
        """
        level = (self.electrification_level or "").lower()
        if level:
            if any(t in level for t in ("hev", "phev", "bev", "hybrid")):
                return True
            if "none" in level or "not applicable" in level or "n/a" in level:
                return False

        engine = (self.engine_model or "").lower()
        if "1tm" in engine:
            return True
        if engine:
            return False

        return None

    @property
    def has_v35a_engine(self) -> bool:
        """V35A-FTS is the recall-eligible 3rd-gen engine."""
        return "v35a" in (self.engine_model or "").lower()


def _parse_payload(vin: str, payload: dict[str, Any]) -> VinDecode:
    variables = {row["Variable"]: row.get("Value") for row in payload.get("Results", [])}

    def get(key: str) -> str | None:
        v = variables.get(key)
        return v.strip() if isinstance(v, str) and v.strip() else None

    year_str = get("Model Year")
    return VinDecode(
        vin=vin,
        make=get("Make"),
        model=get("Model"),
        model_year=int(year_str) if year_str and year_str.isdigit() else None,
        trim=get("Trim"),
        series=get("Series"),
        body_class=get("Body Class"),
        drive_type=get("Drive Type"),
        engine_model=get("Engine Model"),
        fuel_type_primary=get("Fuel Type - Primary"),
        electrification_level=get("Electrification Level"),
        raw=payload,
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8), reraise=True)
async def _fetch(client: httpx.AsyncClient, vin: str) -> dict[str, Any]:
    response = await client.get(VPIC_URL.format(vin=vin))
    response.raise_for_status()
    return response.json()


async def decode(vin: str, *, client: httpx.AsyncClient | None = None) -> VinDecode:
    """Decode a single VIN."""
    if client is None:
        async with httpx.AsyncClient(timeout=15) as new_client:
            payload = await _fetch(new_client, vin)
    else:
        payload = await _fetch(client, vin)
    return _parse_payload(vin, payload)


async def decode_many(vins: list[str], *, concurrency: int = 5) -> list[VinDecode]:
    """Decode many VINs concurrently. Order is preserved."""
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(timeout=15) as client:

        async def _one(v: str) -> VinDecode:
            async with sem:
                return await decode(v, client=client)

        return await asyncio.gather(*(_one(v) for v in vins))
