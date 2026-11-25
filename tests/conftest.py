"""Pytest fixtures: a fresh app + temp SQLite database per test."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Generator

import pytest

os.environ.setdefault("database_url", "sqlite+aiosqlite:///./data/test-default.db")
os.environ.setdefault("rate_limit_default", "100000/minute")
os.environ.setdefault("rate_limit_auth", "100000/minute")
os.environ.setdefault("mirror_3d", "false")

from app.config import get_settings  # noqa: E402


@pytest.fixture()
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "idrive-test.db"


@pytest.fixture()
def client(db_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator:
    """TestClient backed by a throwaway SQLite file."""
    monkeypatch.setenv("database_url", f"sqlite+aiosqlite:///{db_path}")
    # google sign-in is off by default in tests; the flow tests patch it per-test
    monkeypatch.setenv("google_client_id", "")
    get_settings.cache_clear()
    # engine/session singletons reset via lifespan close_db on exit
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers(client) -> dict:
    """Register a user and return Authorization headers."""
    r = client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "long-enough-password", "name": "Test"},
    )
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}
