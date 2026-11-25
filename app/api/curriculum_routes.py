"""Curriculum, reference library and AI-instructor endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.deps import OptionalUser
from app.config import get_settings
from app.schemas import InstructorIn, InstructorOut
from app.services import curriculum, instructor

router = APIRouter(tags=["curriculum"])
limiter = Limiter(key_func=get_remote_address)

_CACHE = "public, max-age=600"


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"detail": f"{what} not found", "code": "not_found"})


@router.get("/api/curriculum")
async def outline(response: Response) -> dict[str, Any]:
    """Modules → chapters → items with titles; no lesson bodies."""
    response.headers["Cache-Control"] = _CACHE
    return curriculum.catalogue()


@router.get("/api/curriculum/lessons/{lesson_id}")
async def lesson(lesson_id: str, response: Response) -> dict[str, Any]:
    payload = curriculum.lesson_payload(lesson_id)
    if payload is None:
        raise _not_found("lesson")
    response.headers["Cache-Control"] = _CACHE
    return payload


@router.get("/api/curriculum/search")
async def search(q: str = Query(default="", max_length=80)) -> dict[str, Any]:
    return {"q": q, "results": curriculum.search(q)}


@router.get("/api/library/lights")
async def lights(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = _CACHE
    return {"lights": [w.model_dump() for w in curriculum.warning_lights()]}


@router.get("/api/library/vehicle")
async def vehicle(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = _CACHE
    return {"parts": [p.model_dump() for p in curriculum.vehicle_parts()]}


@router.get("/api/library/scenarios")
async def scenarios(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = _CACHE
    return {"scenarios": [s.model_dump() for s in curriculum.scenarios()]}


@router.get("/api/library/references")
async def references(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = _CACHE
    return {"references": [{"id": k, **v.model_dump()} for k, v in curriculum.references().items()]}


@router.get("/api/instructor/config")
async def instructor_config(user: OptionalUser) -> dict[str, Any]:
    s = get_settings()
    return {"ai": bool(s.ai_api_key), "signedIn": user is not None}


@router.post("/api/instructor/ask", response_model=InstructorOut)
@limiter.limit(lambda: get_settings().rate_limit_ai)
async def ask(request: Request, body: InstructorIn, user: OptionalUser) -> dict[str, Any]:
    """Grounded answer with citations. Guests and keyless deployments get
    search mode (sources only); signed-in users get the AI answer."""
    s = get_settings()
    return await instructor.ask(
        body.question,
        [t.model_dump() for t in body.history],
        api_key=s.ai_api_key,
        base_url=s.ai_base_url,
        model=s.ai_model,
        allow_ai=user is not None,
    )
