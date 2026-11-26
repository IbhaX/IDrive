"""Admin panel API: user management and an activity overview. Admins only."""

from __future__ import annotations

from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbDep
from app.models import User
from app.services import admin as admin_service
from app.services import auth as auth_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def get_admin(user: CurrentUser) -> User:
    if not auth_service.is_admin(user):
        raise HTTPException(status_code=403, detail={"detail": "admins only", "code": "admin_required"})
    return user


AdminUser = Annotated[User, Depends(get_admin)]


class UserPatchIn(BaseModel):
    role: Optional[Literal["user", "admin"]] = None
    status: Optional[Literal["active", "blocked"]] = None


def _fail(e: admin_service.AdminError) -> HTTPException:
    return HTTPException(status_code=e.status, detail={"detail": e.detail, "code": e.code})


@router.get("/overview")
async def overview(admin: AdminUser, db: DbDep) -> dict[str, Any]:
    return {"stats": await admin_service.overview(db), "recent": await admin_service.recent_attempts(db, 20)}


@router.get("/users")
async def users(
    admin: AdminUser,
    db: DbDep,
    q: str = "",
    role: str = "",
    status: str = "",
    sort: Literal["joined", "last_login", "email", "name"] = "joined",
    order: Literal["asc", "desc"] = "desc",
    page: int = 1,
    size: int = 25,
) -> dict[str, Any]:
    qy = admin_service.UserQuery(q=q[:120], role=role, status=status, sort=sort, desc=order == "desc", page=page, size=size)
    return await admin_service.list_users(db, qy)


@router.patch("/users/{user_id}")
async def update_user(user_id: int, body: UserPatchIn, admin: AdminUser, db: DbDep) -> dict[str, Any]:
    try:
        u = await admin_service.update_user(db, admin, user_id, body.role, body.status)
    except admin_service.AdminError as e:
        raise _fail(e)
    return {"id": u.id, "role": "admin" if auth_service.is_admin(u) else "user", "status": u.status}


@router.post("/users/{user_id}/signout")
async def sign_out(user_id: int, admin: AdminUser, db: DbDep) -> dict[str, Any]:
    try:
        n = await admin_service.sign_out_everywhere(db, admin, user_id)
    except admin_service.AdminError as e:
        raise _fail(e)
    return {"ok": True, "sessions": n}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin: AdminUser, db: DbDep) -> dict[str, Any]:
    try:
        await admin_service.delete_user(db, admin, user_id)
    except admin_service.AdminError as e:
        raise _fail(e)
    return {"ok": True}
