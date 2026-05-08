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
uv run alembic upgrade head

# 3. Verify the analytical spine against ~20 hand-curated VINs (Phase 1)
uv run tundra verify-recalls

# 4. Install dashboard deps and launch
cd ../dashboard
pnpm install
pnpm dev
```

## What the dashboard shows

- **Overview** — total VINs tracked, recall-eligible count, % remedied, median mileage, remedy timeline.
- **Engine failures** — % remedied broken out by year, hybrid/non-hybrid, trim. Mileage at first observation for remedied vs unremedied.
- **Mileage** — distribution by year, by hybrid status, mileage vs price, mileage vs age.
- **VIN explorer** — sortable, filterable table.

## Caveats

- "Recall remedied" is an upper bound on real-world failure rate. Toyota replaced engines proactively, including some that hadn't yet failed.
- Carvana inventory is not a random sample — it skews toward off-lease and dealer-flipped trucks.
- The dashboard is local-only; raw VIN data is not redistributed.
