"""carfax_observations table — definitive 'was engine replaced' source

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-08

Toyota's recall page conflates 'engine replaced' with 'never affected'
(both surface as 'not listed'). Carfax distinguishes the two:

  - Recall code listed with Status: Remedy Performed   → engine replaced
  - Recall code listed with Status: Remedy Available   → not yet replaced
  - Recall code listed with Status: Remedy Not Yet     → recall filed, no fix
  - Recall code NOT listed at all                       → VIN outside affected build

Plus Carfax has full dealer service-history line items (dates +
mileage) so we can timestamp the replacement event.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "carfax_observations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("vin", sa.String(length=17), sa.ForeignKey("vehicles.vin"), nullable=False),
        sa.Column("observed_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        # Top-line indicators
        sa.Column("owner_count", sa.Integer()),
        sa.Column("accident_free", sa.Boolean()),
        sa.Column("open_recall_count", sa.Integer()),
        # Engine recall summary
        sa.Column("engine_recall_listed", sa.Boolean()),
        sa.Column("engine_recall_status", sa.Text()),  # 'open' | 'remedy_available' | 'remedy_not_yet' | 'remedy_performed' | null
        sa.Column("engine_replaced", sa.Boolean()),
        sa.Column("engine_replaced_date", sa.Date()),
        sa.Column("engine_replaced_miles", sa.Integer()),
        # Structured payload
        sa.Column("recalls", postgresql.JSONB()),       # [{code, description, status}]
        sa.Column("service_events", postgresql.JSONB()),  # [{description, date, mileage}]
        # Provenance
        sa.Column("raw_body_size", sa.Integer()),
        sa.Column("source", sa.Text(), server_default="carfax_partner_cvn0", nullable=False),
    )
    op.create_index(
        "ix_carfax_obs_vin_observed",
        "carfax_observations",
        ["vin", "observed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_carfax_obs_vin_observed", table_name="carfax_observations")
    op.drop_table("carfax_observations")
