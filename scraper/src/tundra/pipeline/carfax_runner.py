"""Pipeline: drive Carfax fetcher across every recall-eligible VIN and
persist structured observations.

Per-VIN flow: fetch → parse → upsert in its own transaction. This way
partial runs survive Ctrl-C and dashboards see live progress.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass

import structlog
from sqlalchemy import select, text

from tundra.carfax import CarfaxFetch, fetch_one, parse_body, to_db_payload
from tundra.carfax.fetcher import carfax_browser
from tundra.db import session_scope
from tundra.db.models import Vehicle

log = structlog.get_logger()


@dataclass
class CarfaxRunStats:
    candidates: int = 0
    fetched: int = 0
    captcha_seen: int = 0
    parsed_ok: int = 0
    no_report: int = 0
    engine_replaced: int = 0
    engine_open: int = 0
    engine_not_listed: int = 0


def _candidate_vins() -> list[str]:
    """V35A trucks 2022-2024 — same cohort as the Toyota recall poller."""
    with session_scope() as session:
        return [
            row[0]
            for row in session.execute(
                select(Vehicle.vin)
                .where(Vehicle.engine_code.ilike("%V35A%"))
                .where(Vehicle.model_year.in_([2022, 2023, 2024]))
                .order_by(Vehicle.vin)
            )
        ]


def _persist(fetch: CarfaxFetch) -> dict:
    """Parse + upsert for one VIN. Returns a {key: summary_value} dict
    used for live progress logging."""
    parsed = parse_body(fetch.vin, fetch.body_text)
    payload = to_db_payload(parsed)
    payload["raw_body_size"] = fetch.body_size
    payload["observed_at"] = fetch.fetched_at

    with session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO carfax_observations
                  (vin, observed_at, owner_count, accident_free, open_recall_count,
                   engine_recall_listed, engine_recall_status, engine_replaced,
                   engine_replaced_date, engine_replaced_miles,
                   recalls, service_events, raw_body_size, source)
                VALUES
                  (:vin, :observed_at, :owner_count, :accident_free, :open_recall_count,
                   :engine_recall_listed, :engine_recall_status, :engine_replaced,
                   :engine_replaced_date, :engine_replaced_miles,
                   CAST(:recalls AS JSONB), CAST(:service_events AS JSONB),
                   :raw_body_size, 'carfax_partner_cvn0')
                """
            ),
            {
                **payload,
                "recalls": json.dumps(payload["recalls"]),
                "service_events": json.dumps(payload["service_events"]),
            },
        )

    return {
        "owner_count": parsed.owner_count,
        "open_recalls": parsed.open_recall_count,
        "engine_listed": parsed.engine_recall_listed,
        "engine_status": parsed.engine_recall_status,
        "replaced": parsed.engine_replaced,
        "replaced_at": parsed.engine_replaced_miles,
    }


async def run(
    *,
    limit: int | None = None,
    headless: bool = False,
    delay_seconds: float = 4.0,
) -> CarfaxRunStats:
    stats = CarfaxRunStats()
    vins = _candidate_vins()
    if limit is not None:
        vins = vins[:limit]
    stats.candidates = len(vins)
    if not vins:
        return stats

    async with carfax_browser(headless=headless) as ctx:
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        for idx, vin in enumerate(vins, start=1):
            if idx > 1:
                await asyncio.sleep(delay_seconds)

            try:
                fetch = await fetch_one(page, vin)
            except Exception as e:
                log.warning("carfax.run.fetch_error", vin=vin, idx=idx, total=len(vins), error=str(e))
                continue

            stats.fetched += 1
            if fetch.captcha_seen:
                stats.captcha_seen += 1
                log.warning("carfax.run.captcha", vin=vin, idx=idx, total=len(vins))
                continue
            if not fetch.looks_like_report:
                stats.no_report += 1
                log.info("carfax.run.no_report", vin=vin, idx=idx, total=len(vins), bytes=fetch.body_size)
                continue

            try:
                summary = _persist(fetch)
                stats.parsed_ok += 1
                if summary["replaced"]:
                    stats.engine_replaced += 1
                elif summary["engine_status"] in ("remedy_available", "remedy_not_yet_available"):
                    stats.engine_open += 1
                else:
                    stats.engine_not_listed += 1
                log.info(
                    "carfax.run.ok",
                    idx=idx,
                    total=len(vins),
                    vin=vin,
                    engine_listed=summary["engine_listed"],
                    engine_status=summary["engine_status"] or "—",
                    replaced=summary["replaced"],
                    replaced_at_miles=summary["replaced_at"],
                    open_recalls=summary["open_recalls"],
                    owners=summary["owner_count"],
                )
            except Exception as e:
                log.warning("carfax.run.persist_error", vin=vin, error=str(e))

    return stats
