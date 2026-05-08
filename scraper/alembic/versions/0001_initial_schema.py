"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-08

"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vehicles",
        sa.Column("vin", sa.String(length=17), primary_key=True),
        sa.Column("model_year", sa.Integer(), nullable=False),
        sa.Column("trim", sa.Text()),
        sa.Column("body_style", sa.Text()),
        sa.Column("drivetrain", sa.Text()),
        sa.Column("engine_code", sa.Text()),
        sa.Column("is_hybrid", sa.Boolean()),
        sa.Column("exterior_color", sa.Text()),
        sa.Column("first_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("last_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
    )

    op.create_table(
        "listing_observations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "vin",
            sa.String(length=17),
            sa.ForeignKey("vehicles.vin"),
            nullable=False,
        ),
        sa.Column("source", sa.Text(), nullable=False, server_default="carvana"),
        sa.Column("source_listing_id", sa.Text()),
        sa.Column("url", sa.Text()),
        sa.Column("mileage", sa.Integer()),
        sa.Column("asking_price_usd", sa.Integer()),
        sa.Column("observed_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("raw_payload", postgresql.JSONB()),
    )
    op.execute(
        "CREATE INDEX ix_listing_observations_vin_observed_at "
        "ON listing_observations (vin, observed_at DESC)"
    )

    op.create_table(
        "recalls",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("toyota_campaign", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column("affected_years", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("affected_models", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("build_start_date", sa.Date()),
        sa.Column("build_end_date", sa.Date()),
    )

    op.create_table(
        "recall_status",
        sa.Column(
            "vin",
            sa.String(length=17),
            sa.ForeignKey("vehicles.vin"),
            primary_key=True,
        ),
        sa.Column(
            "recall_id",
            sa.Text(),
            sa.ForeignKey("recalls.id"),
            primary_key=True,
        ),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("checked_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
    )

    op.create_table(
        "recall_status_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("vin", sa.String(length=17), nullable=False),
        sa.Column("recall_id", sa.Text(), nullable=False),
        sa.Column("prev_status", sa.Text()),
        sa.Column("new_status", sa.Text(), nullable=False),
        sa.Column("observed_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_recall_status_events_recall_status_observed",
        "recall_status_events",
        ["recall_id", "new_status", "observed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_recall_status_events_recall_status_observed",
        table_name="recall_status_events",
    )
    op.drop_table("recall_status_events")
    op.drop_table("recall_status")
    op.drop_table("recalls")
    op.execute("DROP INDEX IF EXISTS ix_listing_observations_vin_observed_at")
    op.drop_table("listing_observations")
    op.drop_table("vehicles")
