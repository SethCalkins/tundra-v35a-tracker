"""user_submissions table — crowdsourced engine-replacement reports

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-08

Public data sources (NHTSA recall lookup, Carfax free preview) can't tell
us when an engine was replaced — Toyota's licensing terms strip
completion data from those feeds. Owner self-reports fill the gap.

This table holds raw submissions. The 'verified' flag gates whether a
submission counts toward published metrics. Verification options:
  - email confirmation (basic spam filter)
  - manual admin review of supporting docs
  - cross-confirmation by other submitters of the same VIN
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_submissions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("submitted_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("vin", sa.String(length=17), nullable=False),
        sa.Column("model_year", sa.Integer()),
        sa.Column("trim", sa.Text()),
        sa.Column("is_hybrid", sa.Boolean()),
        sa.Column("current_mileage", sa.Integer()),
        # Engine replacement event
        sa.Column("engine_replaced", sa.Boolean(), nullable=False),
        sa.Column("replacement_date", sa.Date()),
        sa.Column("replacement_mileage", sa.Integer()),
        sa.Column("failure_mode", sa.Text()),
        sa.Column("was_towed", sa.Boolean()),
        sa.Column("dealer_name", sa.Text()),
        sa.Column("dealer_state", sa.String(length=2)),
        sa.Column("under_recall", sa.Boolean()),  # was the swap done under 24V381 / 25V767?
        sa.Column("recall_campaign", sa.Text()),  # 24TA07 / 25TA14 / etc.
        # Verification
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("verification_method", sa.Text()),  # 'email', 'manual', 'doc_upload', etc.
        sa.Column("verified_at", postgresql.TIMESTAMP(timezone=True)),
        # Additional context
        sa.Column("notes", sa.Text()),
        sa.Column("submitter_email", sa.Text()),  # optional, for follow-up
        # Spam protection
        sa.Column("ip_address", postgresql.INET()),
        sa.Column("user_agent", sa.Text()),
        sa.Column("honeypot_failed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_user_subs_vin", "user_submissions", ["vin"])
    op.create_index("ix_user_subs_verified", "user_submissions", ["verified"])
    op.create_index("ix_user_subs_submitted", "user_submissions", ["submitted_at"])


def downgrade() -> None:
    op.drop_index("ix_user_subs_submitted", table_name="user_submissions")
    op.drop_index("ix_user_subs_verified", table_name="user_submissions")
    op.drop_index("ix_user_subs_vin", table_name="user_submissions")
    op.drop_table("user_submissions")
