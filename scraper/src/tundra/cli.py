"""Typer CLI entry point. Subcommands route to the pipeline modules."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from tundra.pipeline.ingest import ingest_file
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
    max_pages: Annotated[int | None, typer.Option(help="Override CARVANA_MAX_PAGES.")] = None,
) -> None:
    """Scrape current Carvana inventory for 3rd-gen Tundras (2022+)."""
    console.print("[yellow]scrape: not implemented yet (Phase 2)[/yellow]")
    raise typer.Exit(code=1)


@app.command(name="decode-vins")
def decode_vins(
    sample: Annotated[bool, typer.Option("--sample", help="Decode hand-curated sample only.")] = False,
) -> None:
    """Backfill VIN-decode data via NHTSA vPIC for vehicles missing it."""
    if not sample:
        console.print("[yellow]decode-vins (DB-driven mode): not implemented yet (Phase 2)[/yellow]")
        console.print("[dim]Run with --sample to decode the hand-curated sample VINs.[/dim]")
        raise typer.Exit(code=1)

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


@app.command(name="poll-recalls")
def poll_recalls(
    sample: Annotated[bool, typer.Option("--sample", help="Poll hand-curated sample only.")] = False,
    headed: Annotated[bool, typer.Option("--headed", help="Show the browser window.")] = False,
) -> None:
    """Refresh recall-completion status for every recall-eligible VIN."""
    if not sample:
        console.print("[yellow]poll-recalls (DB-driven mode): not implemented yet (Phase 1.5)[/yellow]")
        console.print("[dim]Run with --sample to poll the hand-curated sample VINs.[/dim]")
        raise typer.Exit(code=1)

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


@app.command(name="run-all")
def run_all() -> None:
    """Run the full pipeline: scrape → decode-vins → poll-recalls."""
    console.print("[yellow]run-all: not implemented yet (Phase 3)[/yellow]")
    raise typer.Exit(code=1)


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
