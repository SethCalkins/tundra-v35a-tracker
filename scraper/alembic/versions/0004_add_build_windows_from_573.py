"""populate Tundra production windows on recalls from 573 Reports

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-08

Sources:
  - RCLRPT-24V381-6746.PDF (24V381 amended 573 Report, Oct 23 2024)
  - RCLRPT-25V767-6304.pdf (25V767 initial 573 Report, Nov 6 2025)

Both reports state "Not sequential" for VIN ranges — Toyota does not publish
the per-VIN affected list. The production date windows below are the
broadest public eligibility constraint we have. Per-VIN eligibility is
still resolved live via the Toyota recall lookup (toyota.com/recall).

For our Tundra-focused tracker we only encode the Tundra windows on
the recalls table; the cross-model breakdown stays in this migration's
docstring as authoritative reference.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add population estimate column for context in dashboards
    op.add_column(
        "recalls",
        sa.Column("potentially_involved", sa.Integer(), nullable=True),
    )

    # 24V381 — original engine recall, Tundra production window
    op.execute(
        """
        UPDATE recalls
           SET build_start_date = DATE '2021-11-02',
               build_end_date   = DATE '2023-02-13',
               potentially_involved = 102092
         WHERE id = '24V381'
        """
    )

    # 25V767 — expansion, Tundra production window
    op.execute(
        """
        UPDATE recalls
           SET build_start_date = DATE '2021-11-22',
               build_end_date   = DATE '2024-02-14',
               potentially_involved = 113079
         WHERE id = '25V767'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE recalls
           SET build_start_date = NULL,
               build_end_date   = NULL
         WHERE id IN ('24V381', '25V767')
        """
    )
    op.drop_column("recalls", "potentially_involved")
