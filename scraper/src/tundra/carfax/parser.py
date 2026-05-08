"""Parse a Carfax partner-page text dump (extracted via patchright .inner_text())
into structured fields.

Text shape (observed empirically on 2026-05-08, two sample VINs):

  CARFAX 1-Owner Vehicle
  At Least 1 Open Recall
  ...
  Manufacturer Safety recall issued
  Recall #24TA07 SAFETY RECALL 24TA07 (REMEDY NOTICE) - CERTAIN 2022 ? 2023 ...
  Status: Remedy Available
  Learn more about this recall
  Manufacturer Safety recall issued
  Recall #25TB06 25TA06 (INTERIM 25TB06) ...
  Status: Remedy Not Yet Available
  ...
  10,000 mile service performed
  Maintenance inspection completed
  Tire(s) replaced
  Air filter replaced
  Fuel line/hose replaced

The "Status" line follows the "Recall #..." line. Service events appear
as separate stanzas, each with date/mileage in adjacent fields (which
.inner_text() flattens onto separate lines).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

# Toyota / Lexus campaign codes that mean "V35A engine replacement"
ENGINE_RECALL_CODES = frozenset(
    {"24TA07", "24TB07", "24LA04", "24LB04", "25TA14", "25TB14", "25LA07", "25LB07"}
)

DATE_PATTERN = re.compile(r"\b(\d{1,2}/\d{1,2}/\d{2,4})\b")
MILEAGE_PATTERN = re.compile(r"\b([\d,]+) mi\b")
RECALL_HEAD = re.compile(r"Recall #([\dA-Z]+)\s+(.*)", re.I)
STATUS_LINE = re.compile(r"^Status:\s*(.+)$", re.I)


@dataclass
class CarfaxRecall:
    code: str
    description: str
    status: str | None  # 'remedy_available' | 'remedy_not_yet_available' | 'remedy_performed' | unknown


@dataclass
class CarfaxServiceEvent:
    description: str
    date: date | None
    mileage: int | None


@dataclass
class CarfaxParsed:
    vin: str
    owner_count: int | None = None
    accident_free: bool | None = None
    open_recall_count: int | None = None
    recalls: list[CarfaxRecall] = field(default_factory=list)
    service_events: list[CarfaxServiceEvent] = field(default_factory=list)
    engine_recall_listed: bool = False
    engine_recall_status: str | None = None
    engine_replaced: bool = False
    engine_replaced_date: date | None = None
    engine_replaced_miles: int | None = None


def _normalise_status(s: str) -> str:
    s = s.strip().lower()
    if "performed" in s or "complete" in s:
        return "remedy_performed"
    if "not yet" in s:
        return "remedy_not_yet_available"
    if "available" in s:
        return "remedy_available"
    return s.replace(" ", "_")


def _parse_date(s: str) -> date | None:
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_mileage(s: str) -> int | None:
    m = MILEAGE_PATTERN.search(s)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def parse_body(vin: str, body: str) -> CarfaxParsed:
    parsed = CarfaxParsed(vin=vin)
    if not body:
        return parsed

    # Top-line indicators
    if re.search(r"NO ACCIDENTS REPORTED|No Accidents or Damage Reported", body, re.I):
        parsed.accident_free = True
    elif re.search(r"\b(\d+)\s+Accident", body):
        parsed.accident_free = False

    m = re.search(r"At Least (\d+) Open Recall", body)
    if m:
        parsed.open_recall_count = int(m.group(1))
    elif re.search(r"No Open Recall", body, re.I):
        parsed.open_recall_count = 0

    m = re.search(r"CARFAX\s+(\d+)-Owner", body)
    if m:
        parsed.owner_count = int(m.group(1))

    # Recall section: walk lines, anchor on "Recall #..." then look for
    # the next "Status:" line within the next ~6 lines.
    lines = [l.strip() for l in body.split("\n")]
    n = len(lines)
    for i, line in enumerate(lines):
        rec_m = RECALL_HEAD.match(line)
        if not rec_m:
            continue
        code = rec_m.group(1).upper()
        description = rec_m.group(2).strip()
        status = None
        for j in range(i + 1, min(n, i + 8)):
            sm = STATUS_LINE.match(lines[j])
            if sm:
                status = _normalise_status(sm.group(1))
                break
            # If we hit another Recall # line, give up
            if RECALL_HEAD.match(lines[j]):
                break
        parsed.recalls.append(CarfaxRecall(code=code, description=description, status=status))

    # Engine recall summary
    engine_recalls = [r for r in parsed.recalls if r.code in ENGINE_RECALL_CODES]
    if engine_recalls:
        parsed.engine_recall_listed = True
        # Pick the strongest signal among engine recalls (performed > available > not_yet)
        priority = {"remedy_performed": 3, "remedy_available": 2, "remedy_not_yet_available": 1}
        engine_recalls.sort(key=lambda r: priority.get(r.status or "", 0), reverse=True)
        winner = engine_recalls[0]
        parsed.engine_recall_status = winner.status
        parsed.engine_replaced = winner.status == "remedy_performed"
    else:
        parsed.engine_recall_listed = False

    # Service events: scan for known service-line patterns. Each is usually
    # accompanied by a date and mileage on adjacent lines (Carfax timeline UI).
    SERVICE_KEYWORDS = (
        "Engine replaced",
        "Engine assembly replaced",
        "engine repair",
        "Vehicle serviced",
        "service performed",
        "inspection completed",
        "filter replaced",
        "filter cleaned",
        "Tire(s) replaced",
        "Brake pad",
        "Battery",
        "Oil and filter changed",
        "Oil change performed",
        "Fuel line/hose replaced",
        "Fuel system",
        "Spark plug",
        "Recall remedy performed",
        "Vehicle towed",
        "Pre-delivery inspection",
    )
    for i, line in enumerate(lines):
        if not any(k.lower() in line.lower() for k in SERVICE_KEYWORDS):
            continue
        # Look at +/- 5 lines for a date and mileage
        nearby = "\n".join(lines[max(0, i - 5) : min(n, i + 6)])
        d_m = DATE_PATTERN.search(nearby)
        miles = _parse_mileage(nearby)
        parsed.service_events.append(
            CarfaxServiceEvent(
                description=line,
                date=_parse_date(d_m.group(1)) if d_m else None,
                mileage=miles,
            )
        )

    # If engine_replaced is True, find the date + mileage for that event
    if parsed.engine_replaced:
        for ev in parsed.service_events:
            if "engine" in ev.description.lower() and "replac" in ev.description.lower():
                parsed.engine_replaced_date = ev.date
                parsed.engine_replaced_miles = ev.mileage
                break

    return parsed


def to_db_payload(parsed: CarfaxParsed) -> dict[str, Any]:
    """Shape for insertion into carfax_observations."""
    return {
        "vin": parsed.vin,
        "owner_count": parsed.owner_count,
        "accident_free": parsed.accident_free,
        "open_recall_count": parsed.open_recall_count,
        "engine_recall_listed": parsed.engine_recall_listed,
        "engine_recall_status": parsed.engine_recall_status,
        "engine_replaced": parsed.engine_replaced,
        "engine_replaced_date": parsed.engine_replaced_date,
        "engine_replaced_miles": parsed.engine_replaced_miles,
        "recalls": [
            {"code": r.code, "description": r.description, "status": r.status}
            for r in parsed.recalls
        ],
        "service_events": [
            {
                "description": ev.description,
                "date": ev.date.isoformat() if ev.date else None,
                "mileage": ev.mileage,
            }
            for ev in parsed.service_events
        ],
    }
