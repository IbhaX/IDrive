"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
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
    # Comma-separated emails that are always admins (they can open /admin).
    # Admins can also promote other users from the admin panel.
    admin_emails: str = ""
    google_client_secret: str = ""

    # AI instructor via OpenRouter (or any OpenAI-compatible API). Set in the
    # root .env as OPENROUTER_API_KEY / OPENROUTER_MODEL (AI_* names also
    # work). Empty key keeps the instructor in grounded search-only mode.
    ai_api_key: str = Field(default="", validation_alias=AliasChoices("openrouter_api_key", "ai_api_key"))
    ai_base_url: str = Field(default="https://openrouter.ai/api/v1", validation_alias=AliasChoices("openrouter_base_url", "ai_base_url"))
    ai_model: str = Field(default="openai/gpt-4o-mini", validation_alias=AliasChoices("openrouter_model", "ai_model"))
    # Sent as OpenRouter's HTTP-Referer attribution header (optional).
    ai_site_url: str = Field(default="", validation_alias=AliasChoices("openrouter_site_url", "ai_site_url"))
    rate_limit_ai: str = "12/minute"
    # keep a same-origin copy of the 3D car (downloaded in the background at startup)
    mirror_3d: bool = True

    # Public site: canonical URLs, sitemaps, robots, llms.txt, JSON-LD.
    site_url: str = "https://idrive.ibhax.com"
    # Shown on About/Privacy/Terms; empty hides the contact line.
    contact_email: str = ""
    # Google Play listing (shown on /install and in JSON-LD sameAs); empty hides it.
    play_store_url: str = ""
    # Optional Google Analytics 4 / Google Ads. Empty = no analytics script at all.
    ga_measurement_id: str = ""
    ads_id: str = ""
    ads_signup_label: str = ""
    # Redirect plain-http requests to https (only behind a proxy that sets
    # X-Forwarded-Proto; Cloudflare "Always Use HTTPS" is the better place).
    force_https: bool = False
    # Redirect www.<host> to the apex host.
    redirect_www: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


def admin_emails() -> frozenset[str]:
    """Emails listed in ADMIN_EMAILS, lower-cased."""
    return frozenset(e.strip().lower() for e in get_settings().admin_emails.split(",") if e.strip())
