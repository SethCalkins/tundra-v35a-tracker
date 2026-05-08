"""Parse a Chrome DevTools HAR capture from a Carvana search-results page
into the same listing-record shape the bookmarklet produces.

Carvana embeds Schema.org Vehicle JSON-LD inline in the SSR HTML response.
We unescape (twice — RSC + JSON layers) then field-grep around each VIN.
"""
from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

VIN_PATTERN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
DESC_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")
DESC_TRIM_PATTERN = re.compile(
    r"Tundra(?:\s+Hybrid)?\s+(?:CrewMax|Double Cab)?\s*(.*?)(?:\s+\d|\s+with|$)",
    re.IGNORECASE,
)


def _unescape_layers(text: str, max_passes: int = 4) -> str:
    """Peel JSON-string escape layers until the markers stabilise."""
    for _ in range(max_passes):
        new = text.replace(r"\\\"", '"').replace(r"\"", '"')
        if new == text:
            break
        text = new
    return text


def _find_vehicle_blocks(text: str) -> list[str]:
    """Return each Schema.org Vehicle JSON-LD object as its own JSON string.

    Strategy: anchor on the VIN field (every Vehicle record has one), then
    walk backwards to find the unmatched `{` that opens the object, then
    walk forward to the matching `}`. This is robust regardless of key
    ordering inside the object.
    """
    blocks: list[str] = []
    for vin_match in re.finditer(r'"vehicleIdentificationNumber":"[A-HJ-NPR-Z0-9]{17}"', text):
        # Walk backwards finding the unmatched opening brace
        depth = 0
        in_str = False
        start = -1
        i = vin_match.start() - 1
        while i >= 0:
            c = text[i]
            # Skip past escaped characters (peek behind for backslash)
            if c == '"' and (i == 0 or text[i - 1] != "\\"):
                in_str = not in_str
                i -= 1
                continue
            if in_str:
                i -= 1
                continue
            if c == "}":
                depth += 1
            elif c == "{":
                if depth == 0:
                    start = i
                    break
                depth -= 1
            i -= 1
        if start < 0:
            continue

        # Walk forward to the matching close
        depth = 0
        in_str = False
        i = start
        end = -1
        while i < len(text):
            c = text[i]
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_str = not in_str
                i += 1
                continue
            if in_str:
                i += 1
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
            i += 1
        if end < 0:
            continue

        blocks.append(text[start:end])
    return blocks


def _normalise_block(raw: str) -> dict[str, Any] | None:
    """Parse a Vehicle JSON-LD block into our listing record shape.

    Tolerant of minor parse failures — falls back to field-grep within the
    bounded block (still safe because we know the block boundaries).
    """
    fields: dict[str, Any] = {}
    parsed: dict[str, Any] | None = None
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = None

    def grab_str(field: str) -> str | None:
        if parsed is not None and isinstance(parsed.get(field), str):
            return parsed[field]
        mm = re.search(rf'"{field}":"((?:[^"\\]|\\.)*)"', raw)
        return mm.group(1) if mm else None

    def grab_num(field: str, *, scope: str | None = None) -> float | None:
        if parsed is not None:
            value = parsed
            if scope:
                value = parsed.get(scope) or {}
            v = value.get(field) if isinstance(value, dict) else None
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, str):
                try:
                    return float(v.replace(",", ""))
                except ValueError:
                    pass
        # Fall back to grep scoped to this block
        if scope:
            scope_m = re.search(rf'"{scope}":\s*\{{(.*?)\}}', raw)
            search_in = scope_m.group(1) if scope_m else ""
        else:
            search_in = raw
        mm = re.search(rf'"{field}":(-?\d+(?:\.\d+)?)', search_in)
        return float(mm.group(1)) if mm else None

    vin = grab_str("vehicleIdentificationNumber") or ""
    if not VIN_PATTERN.match(vin):
        return None

    description = grab_str("description") or ""
    year_m = DESC_YEAR_PATTERN.search(description)
    is_hybrid = "hybrid" in description.lower()

    # Trim: text between body style ("CrewMax" / "Double Cab") and bed length / mileage
    trim: str | None = None
    trim_m = re.search(
        r"(?:CrewMax|Double Cab)\s+(.+?)(?:\s+\d+\s*(?:1/2\s*)?ft|\s+with\s+\d)",
        description,
        re.IGNORECASE,
    )
    if trim_m:
        trim = trim_m.group(1).strip()

    sku = grab_num("sku")
    sku_str = str(int(sku)) if sku is not None else None

    return {
        "vin": vin,
        "model_year": int(year_m.group(1)) if year_m else None,
        "make": "Toyota",
        "model": "Tundra",
        "trim": trim,
        "mileage": int(grab_num("mileageFromOdometer") or 0) or None,
        "asking_price_usd": int(grab_num("price", scope="offers") or 0) or None,
        "drivetrain": None,
        "exterior_color": None,
        "body_style": None,
        "is_hybrid_hint": is_hybrid,
        "listing_id": sku_str,
        "listing_url": f"https://www.carvana.com/vehicle/{sku_str}" if sku_str else None,
        "raw": {
            "source": "carvana-har",
            "description": description,
            "image": grab_str("image"),
        },
    }


def _extract_listings_from_html(html: str) -> list[dict[str, Any]]:
    text = _unescape_layers(html)
    blocks = _find_vehicle_blocks(text)

    records: dict[str, dict[str, Any]] = {}
    for raw in blocks:
        record = _normalise_block(raw)
        if record is None:
            continue
        vin = record["vin"]
        prev = records.get(vin)
        if prev is None or sum(v is not None for v in record.values()) > sum(
            v is not None for v in prev.values()
        ):
            records[vin] = record

    return list(records.values())


def har_to_payload(har_path: Path) -> dict[str, Any]:
    """Read a HAR file and return a bookmarklet-compatible listings payload."""
    har = json.loads(Path(har_path).read_text())
    entries = har.get("log", {}).get("entries", [])

    all_listings: list[dict[str, Any]] = []
    source_urls: list[str] = []
    for entry in entries:
        url = entry.get("request", {}).get("url", "")
        if "carvana.com/cars/" not in url:
            continue
        content = entry.get("response", {}).get("content", {})
        if "html" not in (content.get("mimeType") or ""):
            continue
        html = content.get("text") or ""
        if content.get("encoding") == "base64":
            import base64
            html = base64.b64decode(html).decode("utf-8", errors="replace")
        if not html:
            continue
        source_urls.append(url)
        all_listings.extend(_extract_listings_from_html(html))

    # Dedupe by VIN one more time across pages
    by_vin: dict[str, dict[str, Any]] = {}
    for r in all_listings:
        prev = by_vin.get(r["vin"])
        if prev is None or sum(v is not None for v in r.values()) > sum(
            v is not None for v in prev.values()
        ):
            by_vin[r["vin"]] = r

    return {
        "schema_version": 1,
        "scraped_at": datetime.now(UTC).isoformat(),
        "source_url": source_urls[0] if source_urls else None,
        "source_urls": source_urls,
        "from_har": str(Path(har_path)),
        "listings": list(by_vin.values()),
    }
