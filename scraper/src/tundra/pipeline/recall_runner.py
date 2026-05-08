"""Drive the Toyota recall poller across every recall-eligible VIN in the DB.

For each (vin, recall_id) where the VIN's model_year intersects the recall's
affected_years and the engine is V35A:
  - Run poll_many to read Toyota's open-recalls list
  - Upsert recall_status with the new status (open / not_listed)
  - Append recall_status_events on first observation or status change
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from tundra.db import RecallStatus, RecallStatusEvent, Vehicle, session_scope
from tundra.recalls import (
    ENGINE_RECALL_24V381_CAMPAIGNS,
    ENGINE_RECALL_25V767_CAMPAIGNS,
    RecallPollResult,
    poll_many,
)

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


def _candidate_vins() -> list[str]:
    """V35A trucks in any of our tracked recalls' year windows."""
    all_years = {y for r in TRACKED_RECALLS for y in r["affected_years"]}
    with session_scope() as session:
        stmt = (
            select(Vehicle.vin)
            .where(Vehicle.model_year.in_(sorted(all_years)))
            .where(Vehicle.engine_code.ilike("%V35A%"))
            .order_by(Vehicle.vin)
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


async def poll_for_db(
    *,
    limit: int | None = None,
    headless: bool = True,
    delay_seconds: float = 1.5,
) -> PollRunStats:
    stats = PollRunStats()

    vins = _candidate_vins()
    if limit is not None:
        vins = vins[:limit]
    stats.candidates = len(vins)
    if not vins:
        return stats

    results = await poll_many(vins, headless=headless, delay_seconds=delay_seconds)
    stats.polled = len(results)

    with session_scope() as session:
        # Pull the current statuses for all (vin, recall) pairs in one query
        existing_rows = session.execute(
            select(RecallStatus).where(RecallStatus.vin.in_(vins))
        ).scalars().all()
        prev_status: dict[tuple[str, str], str] = {
            (r.vin, r.recall_id): r.status for r in existing_rows
        }

        for result in results:
            vehicle_year = session.execute(
                select(Vehicle.model_year).where(Vehicle.vin == result.vin)
            ).scalar()
            if not result.vehicle_recognized:
                stats.failed_lookups += 1

            for recall in TRACKED_RECALLS:
                if vehicle_year is not None and vehicle_year not in recall["affected_years"]:
                    continue

                new_status = _classify(result, recall)
                key = (result.vin, recall["id"])
                old = prev_status.get(key)

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

    return stats
