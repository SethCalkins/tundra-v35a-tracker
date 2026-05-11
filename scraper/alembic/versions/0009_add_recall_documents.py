"""recall_documents — Toyota's filed §573 PDFs, in their own words

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-11

The /lifespan page tells the failure story from owner complaints and remedy
counts. The 'in their own words' angle — what Toyota itself filed with NHTSA
about cause, scope, and remedy — comes from these PDFs.

Doc types (parsed from filename prefix):
  RCLRPT — 573 Safety Recall Report (defect, population, chronology, remedy)
  RCRIT  — Recall amendment / Chronology / supplemental
  RCMN   — Manufacturer notification (dealer + owner letters)
  RCAK   — Acknowledgement
  RMISC  — Miscellaneous
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recall_documents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("recall_id", sa.Text(), nullable=False),
        sa.Column("doc_type", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False, unique=True),
        sa.Column("title", sa.Text()),
        sa.Column("submission_date", sa.Date()),
        sa.Column("source_url", sa.Text()),
        sa.Column("page_count", sa.Integer()),
        sa.Column("body", sa.Text()),
        sa.Column("ingested_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_recall_docs_recall_id_date",
        "recall_documents",
        ["recall_id", "submission_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_recall_docs_recall_id_date", table_name="recall_documents")
    op.drop_table("recall_documents")
