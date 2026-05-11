"""recall_quarterly_reports table — Toyota's quarterly recall remedy reports

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-11

Source: NHTSA FLAT_RCL_Qrtly_Rpts.zip (production.static.nhtsa.dot.gov).
Manufacturers file these every 90 days for each open recall, showing
how many of the involved population have been remedied / are unreachable
/ have been removed from service. Critical for the "of N affected, how
many have actually been swapped" question on /lifespan.

Natural key: (recall_id, quarter). One row per filing per recall.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recall_quarterly_reports",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("recall_id", sa.Text(), nullable=False),
        sa.Column("mfr_name", sa.Text()),
        sa.Column("mfr_campaign", sa.Text()),
        sa.Column("subject", sa.Text()),
        sa.Column("owner_notify_start", sa.Date()),
        sa.Column("owner_notify_end", sa.Date()),
        sa.Column("report_no", sa.Integer()),
        sa.Column("quarter", sa.String(length=9), nullable=False),  # 'YYYY-Q'
        sa.Column("involved", sa.Integer()),
        sa.Column("total_remedied", sa.Integer()),
        sa.Column("total_unreachable", sa.Integer()),
        sa.Column("total_removed", sa.Integer()),
        sa.Column("submission_date", sa.Date()),
        sa.Column("ingested_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.UniqueConstraint("recall_id", "quarter", name="uq_recall_qtrly_recall_quarter"),
    )
    op.create_index(
        "ix_recall_qtrly_recall_quarter",
        "recall_quarterly_reports",
        ["recall_id", "quarter"],
    )


def downgrade() -> None:
    op.drop_index("ix_recall_qtrly_recall_quarter", table_name="recall_quarterly_reports")
    op.drop_table("recall_quarterly_reports")
