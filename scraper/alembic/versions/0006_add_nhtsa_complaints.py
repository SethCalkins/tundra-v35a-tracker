"""nhtsa_complaints table — owner-filed engine failure reports

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-08

Sourced from NHTSA's FLAT_CMPL.zip (https://static.nhtsa.gov/odi/ffdd/cmpl/).
The dataset publishes the first 11 characters of each complaining owner's
VIN (per DPPA), which is enough to bucket by year/engine/plant but not
identify a specific truck. Critically it also publishes:

  * MILES — mileage at the time of failure
  * FAILDATE — date of incident
  * COMPDESC — affected component (e.g. "ENGINE", "ENGINE AND ENGINE COOLING")
  * CDESCR — owner's narrative (free text)
  * CRASH / FIRE / INJURED / DEATHS

This is what lets us answer the user's "how long did the engine last
before it blew up" question with public data.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nhtsa_complaints",
        sa.Column("cmplid", sa.String(length=12), primary_key=True),
        sa.Column("odino", sa.String(length=12), nullable=False),
        sa.Column("manufacturer", sa.Text()),
        sa.Column("make", sa.Text()),
        sa.Column("model", sa.Text()),
        sa.Column("model_year", sa.Integer()),
        sa.Column("vin_prefix", sa.String(length=11)),
        sa.Column("fail_date", sa.Date()),
        sa.Column("date_received", sa.Date()),
        sa.Column("date_added", sa.Date()),
        sa.Column("miles_at_failure", sa.Integer()),
        sa.Column("crash", sa.Boolean()),
        sa.Column("fire", sa.Boolean()),
        sa.Column("vehicle_towed", sa.Boolean()),
        sa.Column("num_injured", sa.Integer()),
        sa.Column("num_deaths", sa.Integer()),
        sa.Column("component", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column("city", sa.Text()),
        sa.Column("state", sa.String(length=2)),
        sa.Column("complaint_type", sa.String(length=8)),
        sa.Column("source", sa.Text(), server_default="nhtsa_flat_cmpl", nullable=False),
        sa.Column("ingested_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index("ix_nhtsa_make_model_year", "nhtsa_complaints", ["make", "model", "model_year"])
    op.create_index("ix_nhtsa_vin_prefix", "nhtsa_complaints", ["vin_prefix"])
    op.create_index("ix_nhtsa_fail_date", "nhtsa_complaints", ["fail_date"])


def downgrade() -> None:
    op.drop_index("ix_nhtsa_fail_date", table_name="nhtsa_complaints")
    op.drop_index("ix_nhtsa_vin_prefix", table_name="nhtsa_complaints")
    op.drop_index("ix_nhtsa_make_model_year", table_name="nhtsa_complaints")
    op.drop_table("nhtsa_complaints")
