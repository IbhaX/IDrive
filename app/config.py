"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration. All values may be overridden via env vars or .env."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), extra="ignore", env_prefix=""
    )

    host: str = "0.0.0.0"
    port: int = 8000

    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'idrive.db'}"

    # Mixed into password/session hashing. In production the app refuses to
    # start while this is still the default.
    secret_pepper: str = "change-me-in-production"
    environment: str = "development"

    session_ttl_days: int = 30
    # Extra seconds added to the mock-exam server-side deadline.
    exam_grace_seconds: int = 10

    rate_limit_default: str = "300/minute"
    rate_limit_auth: str = "20/minute"

    cors_origins: str = "*"
    log_level: str = "INFO"

    # Google sign-in (GIS button → ID token verified server-side). Empty
    # disables the feature. The secret is unused by this flow but kept for
    # deployments that add the server-side code exchange later.
    google_client_id: str = ""
    google_client_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
