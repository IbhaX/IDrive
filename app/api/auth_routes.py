"""Account registration, login, logout and the current-user endpoint."""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.deps import CurrentUser, DbDep
from app.config import get_settings
from app.models import User
from app.schemas import (
    AuthConfigOut,
    AuthOut,
    GoogleIn,
    LoginIn,
    OkOut,
    RegisterIn,
    UserOut,
)
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
    await auth_service.save_attribution(db, user.id, body.attr)
    token = await auth_service.create_session(
        db, user.id, request.headers.get("user-agent", "")
    )
    return AuthOut(token=token, user=_user_out(user))


@router.post("/login", response_model=AuthOut)
@limiter.limit(lambda: get_settings().rate_limit_auth)
async def login(request: Request, body: LoginIn, db: DbDep) -> AuthOut:
    user = await auth_service.login(db, body.email, body.password)
    if user is None:
        # Same message either way - never reveal whether the email exists.
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


@router.delete("/me", response_model=OkOut)
@limiter.limit(lambda: get_settings().rate_limit_auth)
async def delete_me(request: Request, user: CurrentUser, db: DbDep) -> OkOut:
    """Delete the signed-in account, its sessions, progress and attribution."""
    await auth_service.delete_account(db, user)
    return OkOut()


@router.get("/config", response_model=AuthConfigOut)
async def auth_config() -> AuthConfigOut:
    """Public client-side auth config (GIS client id, or empty = disabled)."""
    return AuthConfigOut(google_client_id=get_settings().google_client_id)


@router.post("/google", response_model=AuthOut)
@limiter.limit("20/minute")
async def google_login(request: Request, payload: GoogleIn, db: DbDep) -> AuthOut:
    if not get_settings().google_client_id:
        raise HTTPException(404, "google sign-in disabled")
    try:
        info = await auth_service.verify_google_id_token(payload.credential)
    except ValueError:
        raise HTTPException(401, "invalid google token")
    user = await auth_service.login_or_register_google(db, info["email"], info["name"])
    await auth_service.save_attribution(db, user.id, payload.attr)
    token = await auth_service.create_session(
        db, user.id, request.headers.get("user-agent", "")
    )
    return AuthOut(token=token, user=_user_out(user))
