"""Per-user progress blob endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.deps import CurrentUser, DbDep
from app.models import UserProgress
from app.schemas import OkOut, ProgressIn, ProgressOut
from app.services import progress as progress_service
from app.services.progress import ProgressConflict

router = APIRouter(prefix="/api/progress", tags=["progress"])


def _out(row: UserProgress) -> ProgressOut:
    return ProgressOut(data=row.data or {}, version=row.version, updated_at=row.updated_at)


@router.get("", response_model=ProgressOut)
async def get_progress(user: CurrentUser, db: DbDep) -> ProgressOut:
    row = await progress_service.get(db, user.id)
    if row is None:
        return ProgressOut(data={}, version=0, updated_at=None)
    return _out(row)


@router.put("", response_model=ProgressOut)
async def put_progress(
    body: ProgressIn, user: CurrentUser, db: DbDep
) -> ProgressOut | JSONResponse:
    try:
        row = await progress_service.put(db, user.id, body.data, body.version)
    except ProgressConflict as c:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "progress version conflict",
                "code": "progress_conflict",
                "server": _out(c.row).model_dump(mode="json"),
            },
        )
    return _out(row)


@router.post("/reset", response_model=ProgressOut)
async def reset_progress(user: CurrentUser, db: DbDep) -> ProgressOut:
    row = await progress_service.reset(db, user.id)
    return _out(row)
