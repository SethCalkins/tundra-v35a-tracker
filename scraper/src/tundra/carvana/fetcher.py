"""Fetch Carvana search-results HTML directly via HTTP.

Carvana fronts their site with Cloudflare Turnstile, which blocks naked
curl/httpx and any browser launched with --remote-debugging-port.
`cloudscraper` passes the initial challenge but gets fingerprinted after
a handful of requests and starts receiving stripped responses.

`curl_cffi` solves this by impersonating Chrome's TLS fingerprint at
the libcurl level — Cloudflare can't distinguish our requests from a
real Chrome browser. Empirically returns full 1.1MB SSR pages with
embedded Vehicle JSON-LD, no degradation across many requests.

The same `_extract_listings_from_html` we use for HAR ingest runs over
the response body.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import structlog
from curl_cffi import requests as curl_requests

from tundra.carvana.har_parser import _extract_listings_from_html

log = structlog.get_logger()

CARVANA_SEARCH_BASE = "https://www.carvana.com/cars/toyota-tundra"

# Authentic Chrome 147 fingerprint captured from a real macOS Chrome session.
# curl_cffi's `chrome131` impersonate gets us the TLS handshake; these headers
# bring the application-layer fingerprint up to current.
_CHROME_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
    ),
    "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,"
        "image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
    ),
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br, zstd",
}


@dataclass
class FetchedPage:
    page: int
    url: str
    status: int
    listings: list[dict[str, Any]]
    raw_size: int


def _build_search_url(*, year_min: int, year_max: int | None, page: int) -> str:
    params: dict[str, str | int] = {"year[min]": year_min}
    if year_max is not None:
        params["year[max]"] = year_max
    if page > 1:
        params["page"] = page
    return f"{CARVANA_SEARCH_BASE}?{urlencode(params, safe='[]')}"


def fetch_search_pages(
    *,
    year_min: int = 2022,
    year_max: int | None = None,
    max_pages: int = 20,
    delay_seconds: float = 8.0,
) -> list[FetchedPage]:
    """Walk Carvana search pagination, returning extracted listings per page.

    Stops early when a page returns no new listings (signals end of pagination).
    Polite by default — waits `delay_seconds` between requests.
    """
    session = curl_requests.Session(impersonate="chrome131")
    # Don't override User-Agent / sec-ch-ua: curl_cffi sets them to match the
    # impersonated TLS profile. Mismatched layers get scored as bot.
    session.headers.update({
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Referer": "https://www.carvana.com/",
    })
    seen_vins: set[str] = set()
    pages: list[FetchedPage] = []

    for page in range(1, max_pages + 1):
        url = _build_search_url(year_min=year_min, year_max=year_max, page=page)
        if page > 1:
            time.sleep(delay_seconds)

        log.info("carvana.fetch", page=page, url=url)
        response = session.get(url, timeout=45)
        listings = _extract_listings_from_html(response.text) if response.status_code == 200 else []
        new_listings = [l for l in listings if l["vin"] not in seen_vins]
        for l in new_listings:
            seen_vins.add(l["vin"])

        pages.append(
            FetchedPage(
                page=page,
                url=url,
                status=response.status_code,
                listings=new_listings,
                raw_size=len(response.text),
            )
        )

        # Stop on Cloudflare wall, on missing listings, or once we exhaust new VINs
        if response.status_code != 200:
            log.warning("carvana.fetch.non200", page=page, status=response.status_code)
            break
        if "Just a moment" in response.text or "Verifying you are human" in response.text:
            log.warning("carvana.fetch.cloudflare_wall", page=page)
            break
        if not listings:
            log.info("carvana.fetch.empty_page", page=page)
            break
        if not new_listings and page > 1:
            log.info("carvana.fetch.no_new_vins", page=page)
            break

    return pages


def fetch_to_payload(
    *,
    year_min: int = 2022,
    year_max: int | None = None,
    max_pages: int = 20,
    delay_seconds: float = 8.0,
) -> dict[str, Any]:
    """Fetch and return a bookmarklet/HAR-compatible payload."""
    from datetime import UTC, datetime

    fetched = fetch_search_pages(
        year_min=year_min,
        year_max=year_max,
        max_pages=max_pages,
        delay_seconds=delay_seconds,
    )
    all_listings = [l for p in fetched for l in p.listings]

    return {
        "schema_version": 1,
        "scraped_at": datetime.now(UTC).isoformat(),
        "source_url": fetched[0].url if fetched else None,
        "source_urls": [p.url for p in fetched],
        "from_fetcher": True,
        "pages_fetched": [{"page": p.page, "status": p.status, "listings": len(p.listings), "bytes": p.raw_size} for p in fetched],
        "listings": all_listings,
    }
