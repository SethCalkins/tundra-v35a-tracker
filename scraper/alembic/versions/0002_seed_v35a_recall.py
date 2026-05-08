"""seed V35A engine recall (25V767 / 24TA07)

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-08

NHTSA campaign 25V767 (Toyota internal: 24TA07) authorizes engine
replacement on 2022-2023 Tundras and LX 600s with the V35A-FTS engine
due to manufacturing debris that can cause main bearing failure.

Build window dates left null until verified in Phase 1 against
Toyota/NHTSA primary sources.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO recalls (
            id, toyota_campaign, description,
            affected_years, affected_models,
            build_start_date, build_end_date
        ) VALUES (
            '25V767',
            '24TA07',
            'V35A-FTS engine main bearing manufacturing debris; engine replacement remedy.',
            ARRAY[2022, 2023]::int[],
            ARRAY['Tundra', 'LX 600']::text[],
            NULL,
            NULL
        )
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM recalls WHERE id = '25V767'")
