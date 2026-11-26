"""Serves the mirrored 3D car (see services/model_mirror.py).

Everything comes from this origin: students' networks never have to reach
GitHub (some Indian ISPs block or throttle raw.githubusercontent.com). A file
the background copy has not fetched yet is fetched by the server on demand.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response

from app.services import model_mirror

router = APIRouter(tags=["models"])


@router.get("/api/models/carconcept/status", include_in_schema=False)
async def car_model_status() -> JSONResponse:
    return JSONResponse(model_mirror.status(), headers={"Cache-Control": "no-store"})


@router.get("/models/{key}/{name}", include_in_schema=False)
async def car_model_file(key: str, name: str) -> Response:
    if key != model_mirror.MODEL_KEY or name not in model_mirror.FILES:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    path = model_mirror.local_path(name) or await model_mirror.fetch_one(name)
    if path is None:
        raise HTTPException(status_code=503, detail={"code": "model_unavailable"}, headers={"Retry-After": "30"})
    # pinned commit: the bytes never change
    return FileResponse(
        path,
        media_type=model_mirror.media_type(name),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
