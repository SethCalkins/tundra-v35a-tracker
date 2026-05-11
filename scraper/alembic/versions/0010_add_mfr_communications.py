"""mfr_communications — NHTSA Manufacturer Communications (TSBs) flat-file ingest

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-11

Source: https://static.nhtsa.gov/odi/ffdd/tsbs/MFR_COMMS_RECEIVED_*.zip
Renamed from "TSBs" in May 2024. One row per (NHTSA ID × Make × Model ×
Model-Year-string). Surfaces Toyota's pre-recall service bulletins on the
V35A — the evidence chain that proves Toyota knew about main-bearing
failures well before the NHTSA 24V381 recall.

We filter aggressively to TOYOTA / TUNDRA / 2022+ on ingest so the table
stays at hundreds of rows, not millions.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfr_communications",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("nhtsa_id", sa.Text(), nullable=False, unique=True),
        sa.Column("make", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("model_years", sa.Text(), nullable=False),  # raw "2022,2023" string
        sa.Column("summary", sa.Text()),
        sa.Column("engine_keyword", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ingested_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index("ix_mfrcomms_make_model", "mfr_communications", ["make", "model"])
    op.create_index("ix_mfrcomms_engine_kw", "mfr_communications", ["engine_keyword"])


def downgrade() -> None:
    op.drop_index("ix_mfrcomms_engine_kw", table_name="mfr_communications")
    op.drop_index("ix_mfrcomms_make_model", table_name="mfr_communications")
    op.drop_table("mfr_communications")
