# 3rd Gen Tundra Tracker

Tracks 3rd-gen Toyota Tundra (2022+) listings from Carvana, decodes VINs, polls NHTSA recall status (campaign **25V767** / Toyota **24TA07**), and renders mileage and engine-replacement statistics on a local dashboard.

The recall section of an NHTSA VIN report is the analytical spine: an **Open** 25V767 means the engine has not been replaced; **Remedied** means it has.

## Architecture

```
Carvana (Playwright) ──┐
NHTSA vPIC (httpx) ────┼──► Postgres ──► Next.js dashboard
NHTSA recalls API ─────┘
```

- `scraper/` — Python 3.13 services. Playwright scraper, NHTSA vPIC VIN decoder, recall poller, Typer CLI, Alembic migrations.
- `dashboard/` — Next.js 15 (App Router, TypeScript, Tailwind, Recharts). Reads directly from Postgres.
- `ops/` — example cron schedule for running the pipeline daily.

## Quickstart

```bash
# 1. Bring up Postgres
docker compose up -d

# 2. Install scraper deps & migrate
cd scraper
uv sync
uv run playwright install chromium    # for the recall poller
uv run alembic upgrade head

# 3. Verify the analytical spine against 4 hand-curated VINs (no DB writes)
uv run tundra verify-recalls

# 4. First real run — scrape Carvana, decode VINs, poll recalls
uv run tundra run-all

# 5. Install dashboard deps and launch
cd ../dashboard
pnpm install
pnpm dev
```

## CLI

```text
tundra scrape           Fetch Carvana inventory via curl_cffi (Cloudflare-resilient).
                        Upserts vehicles + appends listing_observations. ~60s for 8 pages.
tundra decode-vins      Backfill NHTSA vPIC data (engine, year, hybrid, drivetrain)
                        for any VIN missing engine_code. Decoupled from scrape because
                        vPIC has aggressive per-IP rate limits.
tundra poll-recalls     Drive toyota.com/recall via Playwright for every V35A truck
                        in the affected model-year window. Persists recall_status +
                        appends recall_status_events on transitions.
tundra run-all          Sequence the above three. --skip-poll for daily runs;
                        full run weekly is sufficient.
tundra verify-recalls   Phase 1 acceptance check — runs decode + poll against 4
                        hand-curated VINs and prints a verdict per truck.
tundra ingest-listings  Read a Carvana scrape JSON or DevTools HAR export and
                        ingest. Useful for one-off captures or backfills.
```

## Cron schedule

See `ops/crontab.example`. Recommended: daily `run-all --skip-poll` at 06:00,
weekly full `run-all` (including recall poll) Mondays 06:30.

## What the dashboard shows

- **Overview** — total VINs tracked, recall-eligible count, % remedied, median mileage, remedy timeline.
- **Engine failures** — % remedied broken out by year, hybrid/non-hybrid, trim. Mileage at first observation for remedied vs unremedied.
- **Mileage** — distribution by year, by hybrid status, mileage vs price, mileage vs age.
- **VIN explorer** — sortable, filterable table.

## Caveats

- "Recall remedied" is an upper bound on real-world failure rate. Toyota replaced engines proactively, including some that hadn't yet failed.
- Carvana inventory is not a random sample — it skews toward off-lease and dealer-flipped trucks.
- The dashboard is local-only; raw VIN data is not redistributed.
