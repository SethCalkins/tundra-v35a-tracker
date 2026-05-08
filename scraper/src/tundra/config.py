"""Centralized configuration via pydantic-settings.

Settings load from (in priority order): process env, then .env in the scraper
directory, then ../.env at the repo root. Lets a single .env at the repo root
serve both Python and the Next.js dashboard.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    database_url: str = Field(
        default="postgresql+psycopg://tundra:tundra@localhost:5433/tundra",
        alias="DATABASE_URL",
    )

    carvana_request_delay_seconds: float = Field(default=25.0)
    carvana_user_agent: str = Field(
        default=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/130.0.0.0 Safari/537.36"
        )
    )
    carvana_max_pages: int = Field(default=20)

    recall_poller_use_toyota_fallback: bool = Field(default=False)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
