"""Serves the mirrored 3D car (see services/model_mirror.py)."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.config import get_settings
from app.services import model_mirror

router = APIRouter(tags=["models"])


@router.get("/models/carconcept/{name}", include_in_schema=False)
async def car_model_file(name: str, background: BackgroundTasks) -> Response:
    path = model_mirror.local_path(name)
    if path is not None:
        # pinned commit: the bytes never change
        return FileResponse(
            path,
            media_type=model_mirror.media_type(name),
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    url = model_mirror.upstream_url(name)
    if url is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if get_settings().mirror_3d:
        background.add_task(model_mirror.ensure)
    return RedirectResponse(url, status_code=307, headers={"Cache-Control": "no-store"})
