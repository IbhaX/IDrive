"""IDrive application entrypoint."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Optional
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.auth_routes import router as auth_router
from app.api.content_routes import router as content_router
from app.api.curriculum_routes import router as curriculum_router
from app.api.exam_routes import router as exam_router
from app.api.model_routes import router as model_router
from app.api.progress_routes import router as progress_router
from app.api.quiz_routes import router as quiz_router
from app.config import BASE_DIR, get_settings
from app.db import close_db, get_session_factory, init_db
from app.logging_config import setup_logging
from app.services import content, curriculum, model_mirror
from app.services.auth import cleanup_expired
from app.web.pages import VersionedStaticFiles, app_build, render_page


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    setup_logging(settings.log_level)
    import logging

    log = logging.getLogger("idrive")
    if (
        settings.environment == "production"
        and settings.secret_pepper == "change-me-in-production"
    ):
        raise RuntimeError("SECRET_PEPPER must be set in production (.env)")
    if settings.secret_pepper == "change-me-in-production":
        log.warning("SECRET_PEPPER is the default — set a real value in .env")
    await init_db()
    async with get_session_factory()() as session:
        removed = await cleanup_expired(session)
        if removed:
            log.info("cleaned up %d expired rows", removed)
    content.warm()
    curriculum.warm()
    log.info("IDrive ready — content version %s", content.version())
    mirror_task: Optional[asyncio.Task[bool]] = None
    if settings.mirror_3d and model_mirror.missing():
        mirror_task = asyncio.create_task(model_mirror.ensure())
    yield
    if mirror_task and not mirror_task.done():
        mirror_task.cancel()
    await close_db()


app = FastAPI(
    title="IDrive",
    version="2.0.0",
    description="Indian road signs, markings, signals and driving theory — learn, quiz, mock-test.",
    lifespan=lifespan,
)

_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def html_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """HTML must revalidate; add basic security headers to every response."""
    resp = await call_next(request)
    ctype = resp.headers.get("content-type", "")
    if "text/html" in ctype:
        resp.headers["Cache-Control"] = "no-cache"
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path.startswith("/api/"):
        resp.headers["X-App-Build"] = app_build(BASE_DIR / "app" / "static")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if "text/html" in ctype:
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: blob:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            # three.js + loaders for the 3D car come from jsDelivr; the Draco/Basis
            # decoders run as WebAssembly in blob: workers.
            "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://cdn.jsdelivr.net; "
            "worker-src 'self' blob:; "
            "frame-src https://accounts.google.com; "
            "connect-src 'self' https://accounts.google.com https://cdn.jsdelivr.net https://raw.githubusercontent.com"
        )
    return resp


app.include_router(auth_router)
app.include_router(content_router)
app.include_router(model_router)
app.include_router(quiz_router)
app.include_router(exam_router)
app.include_router(progress_router)
app.include_router(curriculum_router)

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[get_settings().rate_limit_default],
    enabled=True,
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "rate limit exceeded — slow down and retry",
            "code": "rate_limited",
        },
    )


@app.get("/api/health")
async def health() -> dict[str, bool | str]:
    return {"ok": True, "version": content.version()}


static_dir = BASE_DIR / "app" / "static"
static_dir.mkdir(parents=True, exist_ok=True)

app.mount("/static", VersionedStaticFiles(directory=static_dir), name="static")


@app.get("/", include_in_schema=False)
async def spa() -> Response:
    return render_page(static_dir=static_dir, name="index.html")


# Icons and the web-app manifest at the conventional root paths (browsers and
# home-screen installers ask for these without reading the page first).
_ROOT_FILES: dict[str, tuple[str, str]] = {
    "/favicon.ico": ("img/favicon.ico", "image/x-icon"),
    "/apple-touch-icon.png": ("img/apple-touch-icon.png", "image/png"),
    "/apple-touch-icon-precomposed.png": ("img/apple-touch-icon.png", "image/png"),
    "/manifest.webmanifest": ("manifest.webmanifest", "application/manifest+json"),
}


def _root_file(rel: str, media: str) -> Callable[[], FileResponse]:
    def handler() -> FileResponse:
        return FileResponse(static_dir / rel, media_type=media, headers={"Cache-Control": "public, max-age=86400"})
    return handler


for _url, (_rel, _media) in _ROOT_FILES.items():
    app.get(_url, include_in_schema=False)(_root_file(_rel, _media))


@app.get("/sw.js", include_in_schema=False)
async def service_worker() -> Response:
    """The PWA service worker. Served from the root so it controls the whole
    site; the build fingerprint is baked in so each deploy ships a new worker."""
    body = (static_dir / "sw.js").read_text(encoding="utf-8").replace("__BUILD__", app_build(static_dir))
    return Response(
        body,
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"},
    )


# Hash-routed SPA: every app path serves the shell.
for _path in ("home", "course", "lesson", "learn", "vehicle", "science", "hazard", "theory", "exam", "quiz", "cards", "ask", "progress"):
    app.get("/" + _path, include_in_schema=False)(
        lambda: render_page(static_dir=static_dir, name="index.html")
    )
