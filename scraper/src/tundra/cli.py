"""Typer CLI entry point. Subcommands route to the pipeline modules."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from tundra.carvana import fetch_to_payload
from tundra.pipeline.ingest import ingest_file, ingest_payload
from tundra.recalls import (
    ENGINE_RECALL_24V381_CAMPAIGNS,
    ENGINE_RECALL_25V767_CAMPAIGNS,
    poll_many,
)
from tundra.vin import decode_many

app = typer.Typer(
    name="tundra",
    help="3rd-gen Toyota Tundra engine-failure & mileage tracker",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()

# Sample VINs harvested from Carvana on 2026-05-08 — used by --sample flags and verify-recalls.
# Two are 2022 production (recall-eligible by year), two are 2024 (not eligible for 24V381,
# may be eligible for 25V767 expansion).
SAMPLE_VINS: tuple[str, ...] = (
    "5TFPC5DB9NX007199",  # 2022 Tundra Hybrid (i-FORCE MAX)
    "5TFLA5AB2NX014312",  # 2022 Tundra non-hybrid
    "5TFMA5DBXRX190921",  # 2024 Tundra
    "5TFLA5DA8RX142272",  # 2024 Tundra
)


@app.command()
def scrape(
    year_min: Annotated[int, typer.Option(help="Minimum model year filter.")] = 2022,
    year_max: Annotated[int | None, typer.Option(help="Maximum model year (omit for no cap).")] = None,
    max_pages: Annotated[int, typer.Option(help="Cap on Carvana pagination depth. Scraper stops early when no new VINs appear.")] = 30,
    delay_seconds: Annotated[float, typer.Option(help="Polite delay between page fetches.")] = 8.0,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Fetch only, don't ingest.")] = False,
) -> None:
    """Scrape Carvana inventory via cloudscraper and ingest into Postgres."""
    payload = fetch_to_payload(
        year_min=year_min,
        year_max=year_max,
        max_pages=max_pages,
        delay_seconds=delay_seconds,
    )

    pages = payload.get("pages_fetched", [])
    summary = Table(title=f"Carvana scrape ({len(payload['listings'])} unique VINs)")
    for col in ("page", "status", "new listings", "bytes"):
        summary.add_column(col, justify="right")
    for p in pages:
        summary.add_row(str(p["page"]), str(p["status"]), str(p["listings"]), f"{p['bytes']:,}")
    console.print(summary)

    if dry_run:
        console.print("[yellow]--dry-run set; skipping ingest.[/yellow]")
        return

    stats = asyncio.run(ingest_payload(payload))
    ingest = Table(title="Ingest")
    ingest.add_column("metric")
    ingest.add_column("count", justify="right")
    ingest.add_row("listings seen", str(stats.listings_seen))
    ingest.add_row("invalid VINs (skipped)", str(stats.invalid_vins))
    ingest.add_row("new vehicles", str(stats.new_vehicles))
    ingest.add_row("updated vehicles", str(stats.updated_vehicles))
    ingest.add_row("observations inserted", str(stats.observations_inserted))
    ingest.add_row("vPIC decodes", str(stats.vins_decoded))
    console.print(ingest)


@app.command(name="decode-vins")
def decode_vins(
    sample: Annotated[bool, typer.Option("--sample", help="Decode hand-curated sample only.")] = False,
    limit: Annotated[int | None, typer.Option(help="Cap on VINs decoded this run.")] = None,
    concurrency: Annotated[int, typer.Option(help="Parallel vPIC requests.")] = 2,
    delay_seconds: Annotated[float, typer.Option(help="Pause between vPIC calls.")] = 0.5,
) -> None:
    """Backfill VIN-decode data via NHTSA vPIC for vehicles missing engine info."""
    if sample:
        decoded = asyncio.run(decode_many(list(SAMPLE_VINS)))
        table = Table(title="NHTSA vPIC decode (sample)", show_lines=False)
        for col in ("VIN", "Year", "Trim", "Drive", "Engine", "Hybrid", "V35A?"):
            table.add_column(col)
        for d in decoded:
            table.add_row(
                d.vin,
                str(d.model_year or "?"),
                d.trim or "?",
                (d.drive_type or "?").replace("/4-Wheel Drive/4x4", ""),
                d.engine_model or "?",
                "yes" if d.is_hybrid else "no" if d.is_hybrid is False else "?",
                "yes" if d.has_v35a_engine else "no",
            )
        console.print(table)
        return

    # DB backfill mode
    from tundra.pipeline.decoder import backfill_decodes
    stats = asyncio.run(
        backfill_decodes(limit=limit, concurrency=concurrency, delay_seconds=delay_seconds)
    )
    table = Table(title="vPIC backfill")
    table.add_column("metric")
    table.add_column("count", justify="right")
    table.add_row("candidates (vehicles missing engine_code)", str(stats.candidates))
    table.add_row("decoded ok", str(stats.decoded_ok))
    table.add_row("decoded failed (403/429/empty)", str(stats.decoded_failed))
    table.add_row("rows updated", str(stats.rows_updated))
    console.print(table)


@app.command(name="poll-recalls")
def poll_recalls(
    sample: Annotated[bool, typer.Option("--sample", help="Poll hand-curated sample only.")] = False,
    headed: Annotated[bool, typer.Option("--headed", help="Show the browser window.")] = False,
    limit: Annotated[int | None, typer.Option(help="Cap on VINs polled this run.")] = None,
    delay_seconds: Annotated[float, typer.Option(help="Polite pause between VIN polls.")] = 1.5,
    only_missing: Annotated[bool, typer.Option("--only-missing", help="Skip VINs that already have a recall_status row.")] = False,
) -> None:
    """Refresh recall-completion status for every recall-eligible VIN.

    --sample polls the 4 hand-curated VINs and prints the result table.
    Without --sample, polls every V35A 2022-2024 truck in the DB and
    upserts recall_status + appends recall_status_events.
    """
    if not sample:
        from tundra.pipeline.recall_runner import poll_for_db
        stats = asyncio.run(poll_for_db(
            headless=not headed,
            limit=limit,
            delay_seconds=delay_seconds,
            only_missing=only_missing,
        ))

        table = Table(title="Toyota recall poll (DB)")
        table.add_column("metric")
        table.add_column("count", justify="right")
        table.add_row("candidate VINs", str(stats.candidates))
        table.add_row("polled", str(stats.polled))
        table.add_row("recall_status rows upserted", str(stats.rows_upserted))
        table.add_row("status changes (events)", str(stats.status_changes))
        table.add_row("  first-time open", str(stats.new_open))
        table.add_row("  open → not_listed (remedied?)", str(stats.open_to_not_listed))
        table.add_row("VIN not recognised by Toyota", str(stats.failed_lookups))
        console.print(table)
        return

    results = asyncio.run(poll_many(list(SAMPLE_VINS), headless=not headed))

    table = Table(title="Toyota recall lookup (sample)", show_lines=True)
    for col in ("VIN", "Vehicle", "Open campaigns", "24V381 open", "25V767 open"):
        table.add_column(col)
    for r in results:
        table.add_row(
            r.vin,
            r.vehicle_summary or "[red]not recognized[/red]",
            ", ".join(r.open_campaigns) or "—",
            "[red]YES[/red]" if r.engine_recall_24v381_open else "no",
            "[red]YES[/red]" if r.engine_recall_25v767_open else "no",
        )
    console.print(table)


@app.command(name="ingest-listings")
def ingest_listings(
    path: Annotated[Path, typer.Argument(help="JSON file produced by tools/carvana-scrape.js")],
) -> None:
    """Ingest a Carvana scrape JSON into Postgres (vehicles + listing_observations)."""
    if not path.exists():
        console.print(f"[red]File not found: {path}[/red]")
        raise typer.Exit(code=1)

    stats = asyncio.run(ingest_file(path))

    table = Table(title=f"Ingested {path.name}")
    table.add_column("metric")
    table.add_column("count", justify="right")
    table.add_row("listings seen", str(stats.listings_seen))
    table.add_row("invalid VINs (skipped)", str(stats.invalid_vins))
    table.add_row("new vehicles", str(stats.new_vehicles))
    table.add_row("updated vehicles", str(stats.updated_vehicles))
    table.add_row("observations inserted", str(stats.observations_inserted))
    table.add_row("vPIC decodes", str(stats.vins_decoded))
    console.print(table)


@app.command(name="ingest-nhtsa-complaints")
def ingest_nhtsa_complaints(
    refresh: Annotated[bool, typer.Option("--refresh", help="Re-download FLAT_CMPL.zip even if cached.")] = False,
    year_min: Annotated[int, typer.Option(help="Minimum model year to ingest.")] = 2022,
    year_max: Annotated[int | None, typer.Option(help="Maximum model year (inclusive).")] = None,
) -> None:
    """Download + ingest NHTSA's FLAT_CMPL.zip — owner-filed complaint records.

    Filtered to Toyota Tundra MY 2022+ by default. Each record carries an
    11-char VIN prefix, mileage at failure, and a free-text description.
    Provides the 'how long did the engine last' signal that recall data
    can't (because Toyota's licensing strips completion events).
    """
    from tundra.nhtsa import download_flat_cmpl, ingest_flat_cmpl
    txt_path = download_flat_cmpl(force=refresh)
    console.print(f"[dim]source: {txt_path}[/dim]")
    stats = ingest_flat_cmpl(txt_path, model_year_min=year_min, model_year_max=year_max)
    table = Table(title="NHTSA complaints ingest")
    table.add_column("metric")
    table.add_column("count", justify="right")
    table.add_row("rows seen (Tundra MY ≥ %d)" % year_min, str(stats["seen"]))
    table.add_row("rows upserted", str(stats["inserted"]))
    console.print(table)


@app.command(name="carfax-fetch")
def carfax_fetch(
    limit: Annotated[int | None, typer.Option(help="Cap on VINs fetched this run.")] = None,
    headless: Annotated[bool, typer.Option("--headless", help="Headless mode. Default is headed because patchright passes Akamai better with a visible window.")] = False,
    delay_seconds: Annotated[float, typer.Option(help="Pause between Carfax fetches.")] = 4.0,
    only_missing: Annotated[bool, typer.Option("--only-missing", help="Skip VINs that already have a carfax observation.")] = False,
) -> None:
    """Fetch Carfax partner reports for every recall-eligible V35A truck.

    Uses patchright + persistent Chrome profile to pass Akamai bot detection.
    Per-VIN flow: fetch → parse → upsert in its own transaction so partial
    runs survive interrupts.
    """
    from tundra.pipeline.carfax_runner import run as carfax_run

    stats = asyncio.run(carfax_run(
        limit=limit, headless=headless, delay_seconds=delay_seconds, only_missing=only_missing,
    ))

    table = Table(title="Carfax run")
    table.add_column("metric")
    table.add_column("count", justify="right")
    table.add_row("candidate VINs", str(stats.candidates))
    table.add_row("fetched", str(stats.fetched))
    table.add_row("CAPTCHA encountered", str(stats.captcha_seen))
    table.add_row("no report (Carfax doesn't have it)", str(stats.no_report))
    table.add_row("parsed ok", str(stats.parsed_ok))
    table.add_row("[bold]engine REPLACED[/bold]", str(stats.engine_replaced))
    table.add_row("engine recall open (not replaced)", str(stats.engine_open))
    table.add_row("engine recall not listed", str(stats.engine_not_listed))
    console.print(table)


@app.command(name="run-all")
def run_all(
    max_pages: Annotated[int, typer.Option(help="Carvana pagination cap.")] = 10,
    delay_seconds: Annotated[float, typer.Option(help="Pause between Carvana pages.")] = 8.0,
    skip_poll: Annotated[bool, typer.Option("--skip-poll", help="Skip the recall poll step.")] = False,
    poll_limit: Annotated[int | None, typer.Option(help="Cap recall polls this run.")] = None,
) -> None:
    """Run the full pipeline: scrape → decode-vins → poll-recalls."""
    from tundra.pipeline.decoder import backfill_decodes
    from tundra.pipeline.recall_runner import poll_for_db

    # Step 1: scrape
    console.rule("[bold]1/3 scrape[/bold]")
    payload = fetch_to_payload(max_pages=max_pages, delay_seconds=delay_seconds)
    console.print(f"  fetched {len(payload['listings'])} unique VINs across {len(payload['pages_fetched'])} pages")
    ingest_stats = asyncio.run(ingest_payload(payload))
    console.print(
        f"  ingest: +{ingest_stats.new_vehicles} new, "
        f"{ingest_stats.updated_vehicles} updated, "
        f"{ingest_stats.observations_inserted} observations"
    )

    # Step 2: vPIC backfill
    console.rule("[bold]2/3 decode-vins[/bold]")
    decode_stats = asyncio.run(backfill_decodes(concurrency=2, delay_seconds=0.5))
    console.print(
        f"  candidates {decode_stats.candidates}, "
        f"decoded {decode_stats.decoded_ok}, "
        f"failed {decode_stats.decoded_failed}, "
        f"updated {decode_stats.rows_updated}"
    )

    # Step 3: recall poll
    if skip_poll:
        console.rule("[bold]3/3 poll-recalls (SKIPPED)[/bold]")
        return

    console.rule("[bold]3/3 poll-recalls[/bold]")
    poll_stats = asyncio.run(poll_for_db(limit=poll_limit, delay_seconds=1.5))
    console.print(
        f"  candidates {poll_stats.candidates}, "
        f"polled {poll_stats.polled}, "
        f"upserted {poll_stats.rows_upserted}, "
        f"changes {poll_stats.status_changes}"
    )


@app.command(name="ingest-recall-quarterly")
def ingest_recall_quarterly(
    force: Annotated[bool, typer.Option("--force", help="Re-download even if cached.")] = False,
) -> None:
    """Download + ingest NHTSA's quarterly recall-remedy reports (FLAT_RCL_Qrtly_Rpts).

    Filtered to the V35A recalls (24V381 / 25V767). Idempotent.
    """
    from tundra.nhtsa.recall_quarterly import download, ingest

    console.rule("[bold]ingest recall quarterly reports[/bold]")
    txt_path = download(force=force)
    stats = ingest(txt_path)
    console.print(
        f"  seen={stats['seen']}  upserted={stats['upserted']}",
    )


@app.command(name="ingest-recall-docs")
def ingest_recall_docs() -> None:
    """Parse + ingest the NHTSA §573 PDFs Toyota filed for our recalls."""
    from tundra.nhtsa.recall_documents import ingest

    console.rule("[bold]ingest recall documents[/bold]")
    stats = ingest()
    console.print(
        f"  seen={stats['seen']}  ingested={stats['ingested']}  skipped={stats['skipped']}",
    )


@app.command(name="sync-cloud")
def sync_cloud(
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Count rows without POSTing.")] = False,
) -> None:
    """Push the local Postgres state to the Cloudflare D1 dashboard via /api/ingest.

    Requires env vars INGEST_URL and INGEST_SECRET. Used by the GitHub
    Actions cron workflow after run-all completes.
    """
    from tundra.cloud_ingest import sync_from_env

    console.rule("[bold]sync → Cloudflare D1[/bold]")
    totals = sync_from_env(dry_run=dry_run)
    grand = sum(totals.values())
    console.print(f"[green]ok[/green] — {grand} rows {'previewed' if dry_run else 'sent'}")


@app.command(name="verify-recalls")
def verify_recalls(
    headed: Annotated[bool, typer.Option("--headed", help="Show the browser.")] = False,
) -> None:
    """Phase 1 acceptance check.

    Decodes the sample VINs via NHTSA vPIC and polls Toyota's recall page,
    then prints a combined report. Confirms the analytical spine end-to-end.
    """
    console.rule("[bold]Phase 1 verification[/bold]")
    console.print(f"Engine campaigns tracked: 24V381 {sorted(ENGINE_RECALL_24V381_CAMPAIGNS)}, "
                  f"25V767 {sorted(ENGINE_RECALL_25V767_CAMPAIGNS)}")
    console.print()

    console.print("[bold]Step 1[/bold]: NHTSA vPIC decode")
    decoded = asyncio.run(decode_many(list(SAMPLE_VINS)))
    decode_table = Table(show_lines=False)
    for col in ("VIN", "Year", "Trim", "Engine", "Hybrid", "V35A?"):
        decode_table.add_column(col)
    for d in decoded:
        decode_table.add_row(
            d.vin,
            str(d.model_year or "?"),
            d.trim or "?",
            d.engine_model or "?",
            "yes" if d.is_hybrid else "no" if d.is_hybrid is False else "?",
            "[red]yes[/red]" if d.has_v35a_engine else "no",
        )
    console.print(decode_table)
    console.print()

    console.print("[bold]Step 2[/bold]: Toyota recall page poll")
    poll_results = asyncio.run(poll_many(list(SAMPLE_VINS), headless=not headed))

    combined = Table(title="Combined verification", show_lines=True)
    for col in (
        "VIN",
        "Year",
        "V35A",
        "Toyota saw",
        "Open codes",
        "24V381",
        "25V767",
        "Verdict",
    ):
        combined.add_column(col)

    by_vin = {d.vin: d for d in decoded}
    for r in poll_results:
        d = by_vin[r.vin]
        eligible_24v381 = d.has_v35a_engine and d.model_year in {2022, 2023}
        eligible_25v767 = d.has_v35a_engine and d.model_year in {2022, 2023, 2024}

        if r.engine_recall_24v381_open:
            verdict = "[red]ENGINE RECALL OPEN (24V381)[/red]"
        elif r.engine_recall_25v767_open:
            verdict = "[yellow]ENGINE RECALL OPEN (25V767, remedy TBD)[/yellow]"
        elif eligible_24v381:
            verdict = "[green]possibly remedied or never in scope[/green]"
        elif eligible_25v767:
            verdict = "[dim]not yet flagged (25V767 remedy under dev)[/dim]"
        else:
            verdict = "[dim]not eligible[/dim]"

        combined.add_row(
            r.vin,
            str(d.model_year or "?"),
            "yes" if d.has_v35a_engine else "no",
            r.vehicle_summary or "[red]not recognized[/red]",
            ", ".join(r.open_campaigns) or "—",
            "[red]YES[/red]" if r.engine_recall_24v381_open else "no",
            "[red]YES[/red]" if r.engine_recall_25v767_open else "no",
            verdict,
        )
    console.print(combined)
    console.print()
    console.print("[dim]Caveat: 'absent from open list' cannot prove engine replacement without VIN-range "
                  "eligibility data from Toyota's 573 Reports — Phase 1.5 will resolve this.[/dim]")


if __name__ == "__main__":
    app()
