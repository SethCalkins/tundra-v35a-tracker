"""SQLAlchemy ORM models — single source of truth for the schema.

Alembic autogenerate diffs against `Base.metadata` from this module.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Vehicle(Base):
    """Canonical record per VIN — one row per physical truck we've ever seen."""

    __tablename__ = "vehicles"

    vin: Mapped[str] = mapped_column(String(17), primary_key=True)
    model_year: Mapped[int] = mapped_column(Integer, nullable=False)
    trim: Mapped[str | None] = mapped_column(Text)
    body_style: Mapped[str | None] = mapped_column(Text)
    drivetrain: Mapped[str | None] = mapped_column(Text)
    engine_code: Mapped[str | None] = mapped_column(Text)
    is_hybrid: Mapped[bool | None] = mapped_column(Boolean)
    exterior_color: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)


class ListingObservation(Base):
    """Append-only snapshots of a listing — captures price/mileage drift over time."""

    __tablename__ = "listing_observations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), ForeignKey("vehicles.vin"), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'carvana'"))
    source_listing_id: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    mileage: Mapped[int | None] = mapped_column(Integer)
    asking_price_usd: Mapped[int | None] = mapped_column(Integer)
    observed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    __table_args__ = (
        Index("ix_listing_observations_vin_observed_at", "vin", text("observed_at DESC")),
    )


class Recall(Base):
    """Recall metadata, seeded manually."""

    __tablename__ = "recalls"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    toyota_campaign: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    affected_years: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    affected_models: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    build_start_date: Mapped[date | None] = mapped_column(Date)
    build_end_date: Mapped[date | None] = mapped_column(Date)


class RecallStatus(Base):
    """Latest known recall status per (vin, recall) — overwritten on each poll."""

    __tablename__ = "recall_status"

    vin: Mapped[str] = mapped_column(String(17), ForeignKey("vehicles.vin"), primary_key=True)
    recall_id: Mapped[str] = mapped_column(Text, ForeignKey("recalls.id"), primary_key=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    checked_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)


class RecallStatusEvent(Base):
    """Append-only log of status transitions — drives the 'replacement velocity' chart."""

    __tablename__ = "recall_status_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), nullable=False)
    recall_id: Mapped[str] = mapped_column(Text, nullable=False)
    prev_status: Mapped[str | None] = mapped_column(Text)
    new_status: Mapped[str] = mapped_column(Text, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

    __table_args__ = (
        Index(
            "ix_recall_status_events_recall_status_observed",
            "recall_id",
            "new_status",
            "observed_at",
        ),
    )
