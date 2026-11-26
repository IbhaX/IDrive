"""User accounts and bearer-session management."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Session, User
from app.security import hash_password, hash_token, new_session_token, verify_password

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalise_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email))


async def register(db: AsyncSession, email: str, password: str, name: str) -> User:
    """Create a user. Raises ValueError on a duplicate or bad email."""
    email = normalise_email(email)
    if not valid_email(email):
        raise ValueError("invalid email")
    exists = await db.scalar(select(User.id).where(User.email == email))
    if exists is not None:
        raise ValueError("email already registered")
    user = User(email=email, password_hash=hash_password(password), name=name.strip())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login(db: AsyncSession, email: str, password: str) -> User | None:
    """Return the user on success, else None. Callers must not reveal which
    part failed."""
    user = await db.scalar(select(User).where(User.email == normalise_email(email)))
    if user is None or not verify_password(password, user.password_hash):
        return None
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    return user


async def verify_google_id_token(credential: str) -> dict[str, str]:
    """Verify a GIS ID token via Google's tokeninfo endpoint and return
    {sub, email, name}. Raises ValueError on any invalid claim."""
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
    except httpx.HTTPError:
        raise ValueError("google verify unreachable")
    if r.status_code != 200:
        raise ValueError("token rejected")
    info = r.json()
    if info.get("aud") != get_settings().google_client_id:
        raise ValueError("token not for this app")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("bad issuer")
    if info.get("email_verified") not in (True, "true", "1"):
        raise ValueError("email unverified")
    email = normalise_email(info.get("email", ""))
    if not valid_email(email):
        raise ValueError("no verified email")
    return {"sub": str(info.get("sub", "")), "email": email, "name": (info.get("name") or "").strip()}


async def login_or_register_google(db: AsyncSession, email: str, name: str) -> User:
    """Find a user by verified email or create a passwordless account.
    Accounts merge on email - Google-verified addresses are trusted."""
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, password_hash="", name=name or email.split("@")[0])
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        user.last_login_at = datetime.now(timezone.utc)
        await db.commit()
    return user


async def create_session(db: AsyncSession, user_id: int, user_agent: str = "") -> str:
    """Create a session row, return the raw token (shown once)."""
    token = new_session_token()
    ttl = timedelta(days=get_settings().session_ttl_days)
    db.add(
        Session(
            token_hash=hash_token(token),
            user_id=user_id,
            expires_at=datetime.now(timezone.utc) + ttl,
            user_agent=user_agent[:256],
        )
    )
    await db.commit()
    return token


async def get_user_by_token(db: AsyncSession, token: str) -> User | None:
    if not token:
        return None
    row = await db.scalar(
        select(Session).where(Session.token_hash == hash_token(token))
    )
    if row is None:
        return None
    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp <= datetime.now(timezone.utc):
        await db.delete(row)
        await db.commit()
        return None
    return await db.get(User, row.user_id)


async def logout(db: AsyncSession, token: str) -> None:
    await db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
    await db.commit()


async def cleanup_expired(db: AsyncSession) -> int:
    """Delete expired sessions and stale exam papers. Returns rows removed."""
    now = datetime.now(timezone.utc)
    res = await db.execute(delete(Session).where(Session.expires_at <= now))
    from app.models import ExamPaper

    res2 = await db.execute(
        delete(ExamPaper).where(ExamPaper.created_at < now - timedelta(days=2))
    )
    await db.commit()
    return (res.rowcount or 0) + (res2.rowcount or 0)


_ATTR_KEYS = ("gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "landing", "ts")


def clean_attribution(raw: object) -> dict[str, dict[str, str]]:
    """Keep only known keys, as short strings, for `first` and `last` touch."""
    out: dict[str, dict[str, str]] = {}
    if not isinstance(raw, dict):
        return out
    for touch in ("first", "last"):
        t = raw.get(touch)
        if isinstance(t, dict):
            kept = {k: str(t[k])[:200] for k in _ATTR_KEYS if k in t and t[k] not in (None, "")}
            if kept:
                out[touch] = kept
    return out


async def save_attribution(db: AsyncSession, user_id: int, raw: object) -> None:
    from app.models import SignupAttribution

    data = clean_attribution(raw)
    if not data or await db.get(SignupAttribution, user_id) is not None:
        return
    db.add(SignupAttribution(user_id=user_id, data=data))
    await db.commit()


async def delete_account(db: AsyncSession, user: User) -> None:
    """Delete the user and everything tied to them. Exam papers and attempts
    are kept for aggregate stats but detached (user_id set to NULL)."""
    from sqlalchemy import update

    from app.models import ExamAttempt, ExamPaper, SignupAttribution, UserProgress

    uid = user.id
    await db.execute(delete(Session).where(Session.user_id == uid))
    await db.execute(delete(UserProgress).where(UserProgress.user_id == uid))
    await db.execute(delete(SignupAttribution).where(SignupAttribution.user_id == uid))
    await db.execute(update(ExamPaper).where(ExamPaper.user_id == uid).values(user_id=None))
    await db.execute(update(ExamAttempt).where(ExamAttempt.user_id == uid).values(user_id=None))
    await db.execute(delete(User).where(User.id == uid))
    await db.commit()
