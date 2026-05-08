"""correct V35A engine recall seeds — split into 24V381 (original) and 25V767 (expansion)

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-08

Migration 0002 conflated two distinct recalls. Per NHTSA data:

- **24V381** (filed 2024-05-30) — Toyota campaigns 24TA07/24TB07,
  Lexus 24LA04/24LB04. Covers 2022-2023 Tundra and Lexus LX600 with V35A.
  Remedy: engine replacement. Owner letters mailed Dec 2024–Feb 2025.

- **25V767** (filed 2025-06-11) — Toyota campaigns 25TA14/25TB14,
  Lexus 25LA07/25LB07. Covers 2022-2024 Toyota Tundra, Lexus LX, and
  2024 Lexus GX with V35A. EXPANDS 24V381. Remedy under development;
  final remedy anticipated July/August 2026. Interim letters mailed
  December 16, 2025.

Methodology implication: as of May 2026, only 24V381 has an active
engine-replacement remedy. For 25V767 most eligible VINs will still
appear "open" because Toyota dealers can't perform the repair yet.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Replace stale 0002 row with corrected 25V767 details
    op.execute(
        """
        UPDATE recalls
           SET toyota_campaign = '25TA14',
               description = 'V35A engine main bearing manufacturing debris (expansion of 24V381). '
                             'Covers 2022-2024 Tundra, Lexus LX, 2024 Lexus GX. '
                             'Remedy under development; final remedy anticipated July/August 2026.',
               affected_years = ARRAY[2022, 2023, 2024]::int[],
               affected_models = ARRAY['Tundra', 'LX', 'GX']::text[]
         WHERE id = '25V767'
        """
    )

    # Insert original recall 24V381 (remedy: engine replacement, active since Dec 2024)
    op.execute(
        """
        INSERT INTO recalls (
            id, toyota_campaign, description,
            affected_years, affected_models,
            build_start_date, build_end_date
        ) VALUES (
            '24V381',
            '24TA07',
            'V35A engine main bearing manufacturing debris. '
            'Remedy: engine assembly replacement (active since December 2024). '
            'Covers 2022-2023 Tundra and Lexus LX600.',
            ARRAY[2022, 2023]::int[],
            ARRAY['Tundra', 'LX600']::text[],
            NULL,
            NULL
        )
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM recalls WHERE id = '24V381'")
    op.execute(
        """
        UPDATE recalls
           SET toyota_campaign = '24TA07',
               description = 'V35A-FTS engine main bearing manufacturing debris; engine replacement remedy.',
               affected_years = ARRAY[2022, 2023]::int[],
               affected_models = ARRAY['Tundra', 'LX 600']::text[]
         WHERE id = '25V767'
        """
    )
