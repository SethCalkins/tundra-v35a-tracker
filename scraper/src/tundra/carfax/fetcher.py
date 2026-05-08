"""Fetch Carfax partner reports via patchright (Playwright fork with stealth
patches built in). Uses a persistent Chrome profile so cookies + bot scoring
stay warm across runs.

Carfax fronts their site with Akamai Bot Manager + a slide-puzzle CAPTCHA
fallback. patchright + persistent context + real Chrome channel passes the
initial JS challenge cleanly without ever showing the CAPTCHA in our tests.
If the CAPTCHA does appear, we fall back to a CAPTCHA-solver hook (not yet
implemented — a future patch using Botright's slide-puzzle solver).
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import structlog
from patchright.async_api import BrowserContext, Page, async_playwright

log = structlog.get_logger()

CARFAX_PARTNER_URL = "https://www.carfax.com/VehicleHistory/p/Report.cfx?partner=CVN_0&vin={vin}"

# Persistent profile location — stays warm across CLI invocations.
DEFAULT_PROFILE_DIR = Path.home() / ".cache" / "tundra-tracker" / "patchright-profile"


@dataclass
class CarfaxFetch:
    vin: str
    fetched_at: datetime
    body_text: str
    body_size: int
    looks_like_report: bool
    captcha_seen: bool


@asynccontextmanager
async def carfax_browser(
    *,
    profile_dir: Path | None = None,
    headless: bool = False,
) -> AsyncIterator[BrowserContext]:
    """Open one persistent Chrome session. Reuse for the whole batch."""
    profile = profile_dir or DEFAULT_PROFILE_DIR
    profile.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            channel="chrome",
            headless=headless,
            no_viewport=True,
        )
        try:
            yield ctx
        finally:
            await ctx.close()


async def fetch_one(page: Page, vin: str, *, timeout_ms: int = 45000) -> CarfaxFetch:
    fetched_at = datetime.now(UTC)
    url = CARFAX_PARTNER_URL.format(vin=vin)
    captcha_seen = False
    looks_like_report = False
    body_text = ""

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    except Exception as e:
        log.warning("carfax.fetch.goto_error", vin=vin, error=str(e))

    # Wait for either a report-like content or a CAPTCHA / empty state
    try:
        await page.wait_for_function(
            """() => {
                const t = document.body && document.body.innerText || '';
                return /Owner|recall|Service|24TA07|25TA14|Verification Required|JavaScript disabled/i.test(t);
            }""",
            timeout=20000,
        )
    except Exception:
        pass  # fall through; we'll record whatever's there

    body_text = await page.inner_text("body").catch() if False else ""
    try:
        body_text = await page.inner_text("body")
    except Exception as e:
        log.warning("carfax.fetch.read_error", vin=vin, error=str(e))

    if "Verification Required" in body_text or "Slide right" in body_text:
        captcha_seen = True
    if any(m in body_text for m in ("Manufacturer Recall", "Owner 1", "Service Records")):
        looks_like_report = True

    return CarfaxFetch(
        vin=vin,
        fetched_at=fetched_at,
        body_text=body_text,
        body_size=len(body_text),
        looks_like_report=looks_like_report,
        captcha_seen=captcha_seen,
    )


async def fetch_many(
    vins: list[str],
    *,
    profile_dir: Path | None = None,
    headless: bool = False,
    delay_seconds: float = 4.0,
    on_each: "callable | None" = None,
) -> list[CarfaxFetch]:
    """Fetch a batch sequentially, sharing one browser. Sequential to keep
    Akamai's bot score warm; bursting concurrent requests resets it.

    `on_each(fetch)` is called after each VIN so callers can persist
    incrementally and log progress.
    """
    results: list[CarfaxFetch] = []
    async with carfax_browser(profile_dir=profile_dir, headless=headless) as ctx:
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        for i, vin in enumerate(vins):
            if i > 0:
                await asyncio.sleep(delay_seconds)
            res = await fetch_one(page, vin)
            results.append(res)
            if on_each:
                try:
                    maybe = on_each(res)
                    if asyncio.iscoroutine(maybe):
                        await maybe
                except Exception as e:
                    log.warning("carfax.on_each.error", vin=vin, error=str(e))
    return results
