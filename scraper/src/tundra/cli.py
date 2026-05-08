"""Typer CLI entry point. Subcommands route to the pipeline modules."""
from __future__ import annotations

import typer
from rich.console import Console

app = typer.Typer(
    name="tundra",
    help="3rd-gen Toyota Tundra engine-failure & mileage tracker",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()


@app.command()
def scrape(
    max_pages: int | None = typer.Option(None, help="Override CARVANA_MAX_PAGES."),
) -> None:
    """Scrape current Carvana inventory for 3rd-gen Tundras (2022+)."""
    console.print("[yellow]scrape: not implemented yet (Phase 2)[/yellow]")
    raise typer.Exit(code=1)


@app.command(name="decode-vins")
def decode_vins(
    sample: bool = typer.Option(False, "--sample", help="Decode hand-curated sample only."),
) -> None:
    """Backfill VIN-decode data via NHTSA vPIC for vehicles missing it."""
    console.print("[yellow]decode-vins: not implemented yet (Phase 1)[/yellow]")
    raise typer.Exit(code=1)


@app.command(name="poll-recalls")
def poll_recalls(
    sample: bool = typer.Option(False, "--sample", help="Poll hand-curated sample only."),
) -> None:
    """Refresh recall-completion status for every recall-eligible VIN."""
    console.print("[yellow]poll-recalls: not implemented yet (Phase 1)[/yellow]")
    raise typer.Exit(code=1)


@app.command(name="run-all")
def run_all() -> None:
    """Run the full pipeline: scrape → decode-vins → poll-recalls."""
    console.print("[yellow]run-all: not implemented yet (Phase 3)[/yellow]")
    raise typer.Exit(code=1)


@app.command(name="verify-recalls")
def verify_recalls() -> None:
    """Phase 1 validation: confirm NHTSA exposes recall *completion* per VIN."""
    console.print("[yellow]verify-recalls: not implemented yet (Phase 1)[/yellow]")
    raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
