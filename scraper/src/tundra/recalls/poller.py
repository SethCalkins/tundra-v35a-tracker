"""Recall poller — drives toyota.com/recall and parses the open-recalls list per VIN.

Toyota's recall page accepts `?vin=<VIN>` directly in the URL, so we don't need
to fill the form. The page only renders OPEN/INCOMPLETE recalls (text says
"ready for repair"), which is exactly the signal we want.

For each VIN we report:
  - vehicle_summary  — e.g., "2022 Tundra Hybrid", or None if VIN not recognized
  - open_campaigns   — set of Toyota campaign codes currently flagged as open
  - engine_recall_24v381_open  — true iff 24TA07/24TB07/24LA04/24LB04 listed
  - engine_recall_25v767_open  — true iff 25TA14/25TB14/25LA07/25LB07 listed

A campaign being **absent** from `open_campaigns` cannot, on its own, prove
"engine replaced." It could also mean the VIN was never in the affected build
range. Disambiguating requires VIN-range data from Toyota's 573 Reports,
tracked separately in Phase 1.5.
"""
from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime

from playwright.async_api import Page, async_playwright

# Toyota / Lexus campaign codes that map to NHTSA 24V381 (original V35A engine recall)
ENGINE_RECALL_24V381_CAMPAIGNS: frozenset[str] = frozenset(
    {"24TA07", "24TB07", "24LA04", "24LB04"}
)

# Toyota / Lexus campaign codes that map to NHTSA 25V767 (expansion of 24V381)
ENGINE_RECALL_25V767_CAMPAIGNS: frozenset[str] = frozenset(
    {"25TA14", "25TB14", "25LA07", "25LB07"}
)

ALL_ENGINE_CAMPAIGNS: frozenset[str] = (
    ENGINE_RECALL_24V381_CAMPAIGNS | ENGINE_RECALL_25V767_CAMPAIGNS
)

# Toyota campaign code pattern, e.g. 24TA07, 25TB14, 26TC02
TOYOTA_CAMPAIGN_PATTERN = re.compile(r"\b\d{2}[A-Z]{2}\d{2}\b")

VEHICLE_RESULT_PATTERN = re.compile(
    r"(Tundra|Sequoia|LX|GX|Camry|Corolla|RAV4|Highlander|Tacoma|4Runner|Prius|Sienna)",
    re.IGNORECASE,
)

# Result heading appears as e.g. "2022 Tundra Hybrid" or "2024 Tundra"
RESULT_HEADING_PATTERN = re.compile(
    r"\b(20\d{2}\s+(?:Tundra(?:\s+Hybrid)?|Sequoia(?:\s+Hybrid)?|LX\s*\d*|GX\s*\d*|Camry|Corolla|RAV4|Highlander|Tacoma|4Runner|Prius|Sienna)[^\n]*)",
    re.IGNORECASE,
)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


@dataclass(frozen=True)
class RecallPollResult:
    vin: str
    polled_at: datetime
    vehicle_summary: str | None
    vehicle_recognized: bool
    open_campaigns: tuple[str, ...]
    engine_recall_24v381_open: bool
    engine_recall_25v767_open: bool
    raw_text_excerpt: str = field(repr=False)

    @property
    def any_engine_recall_open(self) -> bool:
        return self.engine_recall_24v381_open or self.engine_recall_25v767_open


_READY_FN = """
() => {
  const h2s = [...document.querySelectorAll('main h2')];
  const matched = h2s.some(h => /Tundra|Sequoia|LX|GX|Camry|Corolla|RAV4|Highlander|Tacoma|4Runner|Prius|Sienna/i.test(h.textContent || ''));
  if (matched) return true;
  const txt = document.body.innerText || '';
  return /Vehicle Not Found|couldn't find|invalid VIN|please enter a valid/i.test(txt);
}
"""


async def _dismiss_cookie_banner(page: Page) -> None:
    """Dismiss the OneTrust cookie banner if present. Toyota's React init waits on this."""
    await page.evaluate(
        """
        () => {
          const buttons = [...document.querySelectorAll('button')];
          const accept = buttons.find(b =>
            b.innerText.trim().toLowerCase() === 'accept' ||
            (b.getAttribute('aria-label') || '').toLowerCase().includes('accept'));
          accept?.click();
        }
        """
    )


async def _poll_one(page: Page, vin: str, *, timeout_ms: int = 30_000) -> RecallPollResult:
    polled_at = datetime.now(UTC)

    # Always start from the form landing page so React can rebuild state
    await page.goto("https://www.toyota.com/recall/", wait_until="domcontentloaded", timeout=timeout_ms)

    # Wait for the form to render
    await page.wait_for_selector(
        "input#form-vin, input[name='vin'], input[placeholder*='VIN' i]",
        timeout=timeout_ms,
    )

    # Dismiss cookie banner before interacting (it intercepts focus and blocks React init)
    await _dismiss_cookie_banner(page)

    # Fill the VIN — try multiple selectors for resilience
    vin_input = page.locator(
        "input#form-vin, input[name='vin'], input[placeholder*='VIN' i]"
    ).first
    await vin_input.fill(vin)

    # Submit. Toyota's button is type="button" with class "submit" and value="submit",
    # not a real submit button. After fill, the "disabled" class clears.
    submit_btn = page.locator(
        "form#vehicleLookupForm button[value='submit']"
    ).first
    await submit_btn.click()

    # Wait for either the vehicle heading or a 'not found' message
    try:
        await page.wait_for_function(_READY_FN, timeout=timeout_ms)
    except Exception:
        pass  # fall through; we'll record whatever's there

    body_text = await page.inner_text("body")

    # Find vehicle summary — prefer h2 nodes, fall back to a body-text regex
    vehicle_summary: str | None = None
    h2_handles = await page.query_selector_all("h2")
    for handle in h2_handles:
        text = (await handle.inner_text()).strip()
        if text and VEHICLE_RESULT_PATTERN.search(text) and "Lookup" not in text:
            vehicle_summary = text
            break
    if vehicle_summary is None:
        m = RESULT_HEADING_PATTERN.search(body_text)
        if m:
            vehicle_summary = m.group(1).strip()

    open_campaigns = tuple(sorted(set(TOYOTA_CAMPAIGN_PATTERN.findall(body_text))))

    return RecallPollResult(
        vin=vin,
        polled_at=polled_at,
        vehicle_summary=vehicle_summary,
        vehicle_recognized=vehicle_summary is not None,
        open_campaigns=open_campaigns,
        engine_recall_24v381_open=bool(set(open_campaigns) & ENGINE_RECALL_24V381_CAMPAIGNS),
        engine_recall_25v767_open=bool(set(open_campaigns) & ENGINE_RECALL_25V767_CAMPAIGNS),
        raw_text_excerpt=body_text[:600],
    )


@asynccontextmanager
async def recall_browser(
    *,
    headless: bool = True,
    user_agent: str = DEFAULT_USER_AGENT,
) -> AsyncIterator[Page]:
    """Open one Chromium page for a batch of recall polls.

    Use when callers want per-VIN control (incremental DB writes, live
    progress logs) — they manage the loop themselves and call `poll(page, vin)`.
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context = await browser.new_context(
            user_agent=user_agent,
            viewport={"width": 1366, "height": 900},
        )
        page = await context.new_page()
        try:
            yield page
        finally:
            await context.close()
            await browser.close()


async def poll(page: Page, vin: str, *, timeout_ms: int = 30_000) -> RecallPollResult:
    """Poll a single VIN using an already-open page (re-uses cookies/session)."""
    return await _poll_one(page, vin, timeout_ms=timeout_ms)


async def poll_many(
    vins: list[str],
    *,
    headless: bool = True,
    user_agent: str = DEFAULT_USER_AGENT,
    delay_seconds: float = 1.5,
    debug_screenshot_dir: str | None = None,
) -> list[RecallPollResult]:
    """Poll a batch of VINs sequentially through one browser context.

    Sequential to avoid hammering Toyota's API. ~1.5 s pause between VINs by default.
    If `debug_screenshot_dir` is set, captures a screenshot per VIN for inspection.
    """
    from pathlib import Path

    results: list[RecallPollResult] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context = await browser.new_context(
            user_agent=user_agent,
            viewport={"width": 1366, "height": 900},
        )
        page = await context.new_page()
        try:
            for i, vin in enumerate(vins):
                if i > 0:
                    await asyncio.sleep(delay_seconds)
                result = await _poll_one(page, vin)
                results.append(result)
                if debug_screenshot_dir:
                    Path(debug_screenshot_dir).mkdir(parents=True, exist_ok=True)
                    await page.screenshot(
                        path=str(Path(debug_screenshot_dir) / f"{vin}.png"),
                        full_page=True,
                    )
        finally:
            await context.close()
            await browser.close()
    return results


async def poll_one(vin: str, *, headless: bool = True) -> RecallPollResult:
    """Convenience for a single-VIN poll."""
    results = await poll_many([vin], headless=headless)
    return results[0]
