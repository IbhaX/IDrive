"""Read-only learning-content endpoints."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.schemas import ContentIndexOut, SignFullOut, SignOut
from app.services import content

router = APIRouter(prefix="/api/content", tags=["content"])

_LONG_CACHE = "public, max-age=3600"


def _etag(payload: object) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return '"' + hashlib.sha256(raw).hexdigest()[:24] + '"'


@router.get("/index", response_model=ContentIndexOut)
async def index(request: Request, response: Response) -> dict[str, Any] | Response:
    """Boot payload: categories, sign texts (no SVGs), topics, UI strings,
    counts. SVGs/articles/glossary load on demand."""
    payload = content.content_index()
    etag = _etag(payload)
    response.headers["ETag"] = etag
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return payload


@router.get("/signs/{sign_id}", response_model=SignFullOut)
async def sign(sign_id: str, response: Response) -> dict[str, Any]:
    d = content.sign_by_id().get(sign_id)
    if d is None:
        raise HTTPException(status_code=404, detail={"detail": "sign not found", "code": "not_found"})
    svg = content.sign_svgs().get(sign_id, "")
    response.headers["Cache-Control"] = _LONG_CACHE
    return {**d, "svg": svg}


@router.get("/svgs")
async def svgs(response: Response, cat: Optional[str] = Query(default=None)) -> dict[str, str]:
    """SVG strings for one category (or all) - cacheable, fetched lazily."""
    wanted = {d["id"] for d in content.signs_in_category(cat or "all")}
    out = {k: v for k, v in content.sign_svgs().items() if k in wanted}
    response.headers["Cache-Control"] = _LONG_CACHE
    return out


@router.get("/theory/{topic_id}")
async def theory(topic_id: str, response: Response) -> dict[str, Any]:
    t = content.topic_by_id().get(topic_id)
    a = content.article(topic_id)
    if t is None or a is None:
        raise HTTPException(status_code=404, detail={"detail": "article not found", "code": "not_found"})
    response.headers["Cache-Control"] = _LONG_CACHE
    return {"topic": t, "article": a}


@router.get("/glossary")
async def glossary(
    response: Response, q: str = Query(default="", max_length=80)
) -> dict[str, Any]:
    entries = content.glossary_search(q)
    response.headers["Cache-Control"] = _LONG_CACHE if not q else "no-cache"
    return {"entries": [{"term": [g[0], g[1]], "definition": [g[2], g[3]]} for g in entries]}


@router.get("/ui")
async def ui_strings(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = _LONG_CACHE
    return content.ui()
