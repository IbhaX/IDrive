"""Per-user progress blob store with optimistic-concurrency versioning."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserProgress


class ProgressConflict(Exception):
    """Raised when a PUT is based on a stale version."""

    def __init__(self, row: UserProgress) -> None:
        self.row = row


async def get(db: AsyncSession, user_id: int) -> Optional[UserProgress]:
    return await db.scalar(
        select(UserProgress).where(UserProgress.user_id == user_id)
    )


async def put(
    db: AsyncSession, user_id: int, data: dict, version: int
) -> UserProgress:
    """Upsert the blob. Existing rows require the matching version, else
    ProgressConflict carries the current row for client-side re-merge."""
    row = await get(db, user_id)
    if row is None:
        row = UserProgress(user_id=user_id, data=data, version=1)
        db.add(row)
    else:
        if version != row.version:
            raise ProgressConflict(row)
        row.data = data
        row.version = row.version + 1
    await db.commit()
    await db.refresh(row)
    return row


async def reset(db: AsyncSession, user_id: int) -> UserProgress:
    row = await get(db, user_id)
    if row is None:
        row = UserProgress(user_id=user_id, data={}, version=1)
        db.add(row)
    else:
        row.data = {}
        row.version = row.version + 1
    await db.commit()
    await db.refresh(row)
    return row
