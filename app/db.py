"""Async SQLAlchemy engine/session setup. SQLite runs in WAL mode."""

from __future__ import annotations

from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import Connection, event, inspect, text
from sqlalchemy.pool import ConnectionPoolEntry, PoolProxiedConnection
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        url = get_settings().database_url
        if url.startswith("sqlite"):
            db_path = url.split("///")[-1]
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(url, echo=False, pool_pre_ping=True)

        @event.listens_for(_engine.sync_engine, "connect")
        def _set_sqlite_pragma(
            dbapi_conn: PoolProxiedConnection, _record: ConnectionPoolEntry
        ) -> None:
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        yield session


async def init_db() -> None:
    """Create all tables (dev convenience; owns schema for v1)."""
    from app.models import Base

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


# Columns added after v1. create_all() never alters an existing table, so a
# database created before these existed gets them here (idempotent).
_ADDED_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "users": [
        ("role", "VARCHAR(16) NOT NULL DEFAULT 'user'"),
        ("status", "VARCHAR(16) NOT NULL DEFAULT 'active'"),
    ],
}


def _add_missing_columns(sync_conn: Connection) -> None:
    insp = inspect(sync_conn)
    for table, cols in _ADDED_COLUMNS.items():
        have = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols:
            if name not in have:
                sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


async def close_db() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
