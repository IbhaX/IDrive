"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.services import auth as auth_service

DbDep = Annotated[AsyncSession, Depends(get_session)]


def _bearer(authorization: Optional[str]) -> str:
    if not authorization:
        return ""
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return ""
    return parts[1].strip()


async def get_current_user(
    db: DbDep, authorization: Annotated[Optional[str], Header()] = None
) -> User:
    user = await auth_service.get_user_by_token(db, _bearer(authorization))
    if user is None:
        raise HTTPException(
            status_code=401,
            detail={"detail": "authentication required", "code": "auth_required"},
        )
    return user


async def get_optional_user(
    db: DbDep, authorization: Annotated[Optional[str], Header()] = None
) -> Optional[User]:
    return await auth_service.get_user_by_token(db, _bearer(authorization))


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[Optional[User], Depends(get_optional_user)]
