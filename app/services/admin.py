"""Admin panel: user management and a small activity overview.

Routes (app/api/admin_routes.py) only check that the caller is an admin and
translate errors; every rule lives here:
- an admin cannot change their own role or access, or delete themselves
  (no accidental lock-out);
- accounts listed in ADMIN_EMAILS stay admins (the setting wins), so they
  cannot be demoted or blocked from the panel;
- blocking an account deletes all its sessions, and blocked accounts cannot
  sign in again until an admin restores access.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import admin_emails
from app.models import ExamAttempt, Session, User, UserProgress
from app.services import auth as auth_service

ROLES = ("user", "admin")
STATUSES = ("active", "blocked")
SORTS = ("joined", "last_login", "email", "name")
PAGE_MAX = 100


class AdminError(Exception):
    """A request the rules above refuse. `code` is sent to the client."""

    def __init__(self, code: str, detail: str, status: int = 400) -> None:
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _naive(dt: datetime) -> datetime:
    """SQLite stores naive UTC datetimes; compare like with like."""
    return dt.replace(tzinfo=None)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _progress_summary(data: Optional[dict[str, Any]]) -> dict[str, int]:
    """Lessons passed, mock tests taken/passed/best, active days and study minutes from the progress blob."""
    d = data or {}
    les = d.get("les") or {}
    mock = d.get("mock") or {}
    return {
        "lessons": sum(1 for v in les.values() if isinstance(v, dict) and v.get("d")),
        "mockTaken": int(mock.get("taken") or 0),
        "mockPassed": int(mock.get("passed") or 0),
        "mockBest": int(mock.get("best") or 0),
        "days": len(d.get("days") or {}),
        "minutes": int((d.get("secs") or 0) // 60),
    }


async def overview(db: AsyncSession) -> dict[str, int]:
    now = _naive(_now())
    week = now - timedelta(days=7)
    users = await db.scalar(select(func.count(User.id))) or 0
    admins = await db.scalar(select(func.count(User.id)).where(or_(User.role == "admin", User.email.in_(admin_emails() or {""})))) or 0
    blocked = await db.scalar(select(func.count(User.id)).where(User.status == "blocked")) or 0
    new7 = await db.scalar(select(func.count(User.id)).where(User.created_at >= week)) or 0
    active7 = await db.scalar(select(func.count(User.id)).where(User.last_login_at >= week)) or 0
    sessions = await db.scalar(select(func.count(Session.token_hash)).where(Session.expires_at > now)) or 0
    mocks7 = await db.scalar(select(func.count(ExamAttempt.id)).where(ExamAttempt.mode == "mock", ExamAttempt.created_at >= week)) or 0
    passed7 = await db.scalar(select(func.count(ExamAttempt.id)).where(ExamAttempt.mode == "mock", ExamAttempt.passed == 1, ExamAttempt.created_at >= week)) or 0
    return {"users": users, "admins": admins, "blocked": blocked, "new7": new7, "active7": active7,
            "sessions": sessions, "mocks7": mocks7, "passed7": passed7}


@dataclass
class UserQuery:
    q: str = ""
    role: str = ""
    status: str = ""
    sort: str = "joined"
    desc: bool = True
    page: int = 1
    size: int = 25


def _filtered(stmt: Select[Any], qy: UserQuery) -> Select[Any]:
    if qy.q.strip():
        like = f"%{qy.q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.name).like(like)))
    if qy.role == "admin":
        stmt = stmt.where(or_(User.role == "admin", User.email.in_(admin_emails() or {""})))
    elif qy.role == "user":
        stmt = stmt.where(User.role != "admin", User.email.not_in(admin_emails() or {""}))
    if qy.status in STATUSES:
        stmt = stmt.where(User.status == qy.status)
    return stmt


async def list_users(db: AsyncSession, qy: UserQuery) -> dict[str, Any]:
    size = max(1, min(PAGE_MAX, qy.size))
    page = max(1, qy.page)
    total = await db.scalar(_filtered(select(func.count(User.id)), qy)) or 0
    col = {"joined": User.created_at, "last_login": User.last_login_at, "email": User.email, "name": User.name}.get(qy.sort, User.created_at)
    order = col.desc() if qy.desc else col.asc()
    now = _naive(_now())
    live = (select(Session.user_id, func.count(Session.token_hash).label("n"))
            .where(Session.expires_at > now).group_by(Session.user_id).subquery())
    stmt = _filtered(
        select(User, UserProgress.data, live.c.n)
        .outerjoin(UserProgress, UserProgress.user_id == User.id)
        .outerjoin(live, live.c.user_id == User.id),
        qy,
    ).order_by(order, User.id.desc()).offset((page - 1) * size).limit(size)
    rows = (await db.execute(stmt)).all()
    env = admin_emails()
    return {
        "total": total, "page": page, "size": size,
        "users": [{
            "id": u.id, "email": u.email, "name": u.name, "lang": u.lang,
            "role": "admin" if auth_service.is_admin(u) else "user",
            "status": u.status or "active",
            "envAdmin": u.email in env,
            "provider": "google" if not u.password_hash else "password",
            "joined": _iso(u.created_at), "lastLogin": _iso(u.last_login_at),
            "sessions": int(n or 0),
            "progress": _progress_summary(data),
        } for u, data, n in rows],
    }


async def _target(db: AsyncSession, actor: User, user_id: int) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise AdminError("not_found", "no such user", 404)
    if user.id == actor.id:
        raise AdminError("self", "you cannot change your own account here")
    return user


async def update_user(db: AsyncSession, actor: User, user_id: int, role: Optional[str], status: Optional[str]) -> User:
    user = await _target(db, actor, user_id)
    if role is not None and role not in ROLES:
        raise AdminError("bad_role", "role must be user or admin")
    if status is not None and status not in STATUSES:
        raise AdminError("bad_status", "access must be active or blocked")
    if user.email in admin_emails() and (role == "user" or status == "blocked"):
        raise AdminError("env_admin", "this admin is set in ADMIN_EMAILS; remove them there first")
    if role is not None:
        user.role = role
    if status is not None and status != user.status:
        user.status = status
        if status == "blocked":
            await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    await db.refresh(user)
    return user


async def sign_out_everywhere(db: AsyncSession, actor: User, user_id: int) -> int:
    user = await _target(db, actor, user_id)
    res = await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return res.rowcount or 0


async def delete_user(db: AsyncSession, actor: User, user_id: int) -> None:
    user = await _target(db, actor, user_id)
    if user.email in admin_emails():
        raise AdminError("env_admin", "this admin is set in ADMIN_EMAILS; remove them there first")
    await auth_service.delete_account(db, user)


async def recent_attempts(db: AsyncSession, limit: int = 20) -> list[dict[str, Any]]:
    """Latest mock tests and practice sets, with who took them (if the account still exists)."""
    stmt = (select(ExamAttempt, User.email, User.name)
            .outerjoin(User, User.id == ExamAttempt.user_id)
            .order_by(ExamAttempt.created_at.desc(), ExamAttempt.id.desc()).limit(max(1, min(100, limit))))
    rows = (await db.execute(stmt)).all()
    return [{"id": a.id, "when": _iso(a.created_at), "mode": a.mode, "topic": a.topic, "score": a.score, "total": a.total,
             "passed": bool(a.passed), "late": bool(a.late), "email": email, "name": name} for a, email, name in rows]
