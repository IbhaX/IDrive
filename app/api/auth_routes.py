"""Account registration, login, logout and the current-user endpoint."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.deps import CurrentUser, DbDep
from app.config import get_settings
from app.models import User
from app.schemas import AuthOut, LoginIn, OkOut, RegisterIn, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

limiter = Limiter(key_func=get_remote_address)


def _user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, lang=u.lang)


@router.post("/register", response_model=AuthOut, status_code=201)
@limiter.limit(lambda: get_settings().rate_limit_auth)
async def register(request: Request, body: RegisterIn, db: DbDep) -> AuthOut:
    try:
        user = await auth_service.register(db, body.email, body.password, body.name)
    except ValueError as e:
        code = "email_taken" if "registered" in str(e) else "invalid_email"
        raise HTTPException(status_code=400, detail={"detail": str(e), "code": code})
    token = await auth_service.create_session(
        db, user.id, request.headers.get("user-agent", "")
    )
    return AuthOut(token=token, user=_user_out(user))


@router.post("/login", response_model=AuthOut)
@limiter.limit(lambda: get_settings().rate_limit_auth)
async def login(request: Request, body: LoginIn, db: DbDep) -> AuthOut:
    user = await auth_service.login(db, body.email, body.password)
    if user is None:
        # Same message either way — never reveal whether the email exists.
        raise HTTPException(
            status_code=401,
            detail={"detail": "invalid email or password", "code": "bad_credentials"},
        )
    token = await auth_service.create_session(
        db, user.id, request.headers.get("user-agent", "")
    )
    return AuthOut(token=token, user=_user_out(user))


@router.post("/logout", response_model=OkOut)
async def logout(
    db: DbDep, authorization: Annotated[Optional[str], Header()] = None
) -> OkOut:
    from app.api.deps import _bearer

    await auth_service.logout(db, _bearer(authorization))
    return OkOut()


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return _user_out(user)
