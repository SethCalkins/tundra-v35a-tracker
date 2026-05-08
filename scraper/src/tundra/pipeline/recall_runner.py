"""Drive the Toyota recall poller across every recall-eligible VIN in the DB.

For each (vin, recall_id) where the VIN's model_year intersects the recall's
affected_years and the engine is V35A:
  - Run poll_many to read Toyota's open-recalls list
  - Upsert recall_status with the new status (open / not_listed)
  - Append recall_status_events on first observation or status change
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from tundra.db import RecallStatus, RecallStatusEvent, Vehicle, session_scope
from tundra.recalls import (
    ENGINE_RECALL_24V381_CAMPAIGNS,
    ENGINE_RECALL_25V767_CAMPAIGNS,
    RecallPollResult,
    poll,
    recall_browser,
)

log = structlog.get_logger()

# Recall metadata baked in for the runner. Could lift to DB later.
TRACKED_RECALLS: list[dict] = [
    {
        "id": "24V381",
        "campaigns": ENGINE_RECALL_24V381_CAMPAIGNS,
        "affected_years": (2022, 2023),
    },
    {
        "id": "25V767",
        "campaigns": ENGINE_RECALL_25V767_CAMPAIGNS,
        "affected_years": (2022, 2023, 2024),
    },
]


@dataclass
class PollRunStats:
    candidates: int = 0
    polled: int = 0
    rows_upserted: int = 0
    status_changes: int = 0
    new_open: int = 0
    open_to_not_listed: int = 0
    failed_lookups: int = 0


def _candidate_vins(only_missing: bool = False) -> list[str]:
    """V35A trucks in any of our tracked recalls' year windows.

    If only_missing is True, exclude VINs that already have a recall_status
    row — useful when the cohort grew from a deeper scrape and we only want
    to fill the gaps.
    """
    all_years = {y for r in TRACKED_RECALLS for y in r["affected_years"]}
    with session_scope() as session:
        stmt = (
            select(Vehicle.vin)
            .where(Vehicle.model_year.in_(sorted(all_years)))
            .where(Vehicle.engine_code.ilike("%V35A%"))
            .order_by(Vehicle.vin)
        )
        if only_missing:
            stmt = stmt.where(
                ~Vehicle.vin.in_(select(RecallStatus.vin).distinct())
            )
        return [row[0] for row in session.execute(stmt)]


def _classify(result: RecallPollResult, recall: dict) -> str:
    """Classify this VIN's status against this recall."""
    if not result.vehicle_recognized:
        return "unknown"
    open_set = set(result.open_campaigns)
    if open_set & recall["campaigns"]:
        return "open"
    return "not_listed"


def _persist_one(
    result: RecallPollResult, model_year: int | None, stats: PollRunStats
) -> dict[str, str]:
    """Upsert recall_status for one VIN and append events on changes.

    Returns a {recall_id: new_status} map so the caller can log a one-line
    summary per VIN. Each call commits in its own transaction so partial
    progress survives interrupts.
    """
    summary: dict[str, str] = {}
    with session_scope() as session:
        existing = {
            r.recall_id: r.status
            for r in session.execute(
                select(RecallStatus).where(RecallStatus.vin == result.vin)
            ).scalars()
        }

        for recall in TRACKED_RECALLS:
            if model_year is not None and model_year not in recall["affected_years"]:
                continue

            new_status = _classify(result, recall)
            old = existing.get(recall["id"])
            summary[recall["id"]] = new_status

            stmt = pg_insert(RecallStatus).values(
                vin=result.vin,
                recall_id=recall["id"],
                status=new_status,
                source="toyota_recall_lookup",
                checked_at=result.polled_at,
            ).on_conflict_do_update(
                index_elements=["vin", "recall_id"],
                set_={
                    "status": new_status,
                    "source": "toyota_recall_lookup",
                    "checked_at": result.polled_at,
                },
            )
            session.execute(stmt)
            stats.rows_upserted += 1

            if old != new_status:
                session.add(
                    RecallStatusEvent(
                        vin=result.vin,
                        recall_id=recall["id"],
                        prev_status=old,
                        new_status=new_status,
                        observed_at=result.polled_at,
                    )
                )
                stats.status_changes += 1
                if old is None and new_status == "open":
                    stats.new_open += 1
                elif old == "open" and new_status == "not_listed":
                    stats.open_to_not_listed += 1

    return summary


async def poll_for_db(
    *,
    limit: int | None = None,
    headless: bool = True,
    delay_seconds: float = 1.5,
    only_missing: bool = False,
) -> PollRunStats:
    """Poll every recall-eligible VIN, writing per-VIN to Postgres.

    Each VIN is committed in its own transaction so partial runs survive
    interrupts and `tail -f` shows live progress.
    """
    stats = PollRunStats()

    vins = _candidate_vins(only_missing=only_missing)
    if limit is not None:
        vins = vins[:limit]
    stats.candidates = len(vins)
    if not vins:
        return stats

    # Fetch model_years up front so the per-VIN persistence loop doesn't need
    # an extra round-trip
    with session_scope() as session:
        years_by_vin = {
            v: y
            for v, y in session.execute(
                select(Vehicle.vin, Vehicle.model_year).where(Vehicle.vin.in_(vins))
            )
        }

    async with recall_browser(headless=headless) as page:
        for idx, vin in enumerate(vins, start=1):
            if idx > 1:
                await asyncio.sleep(delay_seconds)
            try:
                result = await poll(page, vin)
            except Exception as e:
                log.warning("recall.poll.error", vin=vin, idx=idx, total=len(vins), error=str(e))
                stats.failed_lookups += 1
                continue

            stats.polled += 1
            if not result.vehicle_recognized:
                stats.failed_lookups += 1

            try:
                summary = _persist_one(result, years_by_vin.get(vin), stats)
            except Exception as e:
                log.warning("recall.persist.error", vin=vin, error=str(e))
                continue

            log.info(
                "recall.poll",
                idx=idx,
                total=len(vins),
                vin=vin,
                vehicle=result.vehicle_summary or "unrecognized",
                **{f"recall_{k}": v for k, v in summary.items()},
            )

    return stats
