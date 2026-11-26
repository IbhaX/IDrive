"""IDrive application entrypoint."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Optional
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.auth_routes import router as auth_router
from app.api.admin_routes import router as admin_router
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
from app.web import seo
from app.web.pages import VersionedStaticFiles, app_build, importmap_hashes, render_page, shell_markup


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
        log.warning("SECRET_PEPPER is the default - set a real value in .env")
    await init_db()
    async with get_session_factory()() as session:
        removed = await cleanup_expired(session)
        if removed:
            log.info("cleaned up %d expired rows", removed)
    content.warm()
    curriculum.warm()
    log.info("IDrive ready - content version %s", content.version())
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
    description="Indian road signs, markings, signals and driving theory - learn, quiz, mock-test.",
    lifespan=lifespan,
)

_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
# compress responses (the 3D model geometry shrinks a lot)
app.add_middleware(GZipMiddleware, minimum_size=1024)
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
    """HTML must revalidate; add security headers to every response; send
    www and (optionally) plain-http requests to the canonical origin."""
    settings = get_settings()
    host = request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    if settings.redirect_www and host.startswith("www."):
        target = f"https://{host[4:]}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
        return RedirectResponse(target, status_code=301)
    if settings.force_https and proto == "http" and not host.startswith(("localhost", "127.0.0.1")):
        target = f"https://{host}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
        return RedirectResponse(target, status_code=301)
    resp = await call_next(request)
    if proto == "https":
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    # framing is governed by CSP frame-ancestors (self + the ibhax.com homepage previews)
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    ctype = resp.headers.get("content-type", "")
    if "text/html" in ctype:
        resp.headers["Cache-Control"] = "no-cache"
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path.startswith("/api/"):
        resp.headers["X-App-Build"] = app_build(BASE_DIR / "app" / "static")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if "text/html" in ctype:
        _gtag = bool(settings.ga_measurement_id or settings.ads_id)
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: blob:" + (" https://*.google-analytics.com https://*.googletagmanager.com https://*.g.doubleclick.net https://www.google.com https://www.google.co.in" if _gtag else "") + "; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            # three.js (original addons via the hashed import map) comes from jsDelivr
            "script-src 'self' "
            + " ".join(importmap_hashes(BASE_DIR / "app" / "static"))
            + " https://accounts.google.com https://cdn.jsdelivr.net" + (" https://www.googletagmanager.com" if _gtag else "") + "; "
            "frame-src https://accounts.google.com" + (" https://td.doubleclick.net https://www.googletagmanager.com" if _gtag else "") + "; "
            "connect-src 'self' https://accounts.google.com https://cdn.jsdelivr.net"
            + (" https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.g.doubleclick.net https://www.google.com https://googleads.g.doubleclick.net" if _gtag else "")
            + "; frame-ancestors 'self' https://ibhax.com; base-uri 'self'; form-action 'self' https://accounts.google.com"
        )
    return resp


app.include_router(auth_router)
app.include_router(content_router)
app.include_router(model_router)
app.include_router(quiz_router)
app.include_router(exam_router)
app.include_router(progress_router)
app.include_router(curriculum_router)
app.include_router(admin_router)

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
            "detail": "rate limit exceeded - slow down and retry",
            "code": "rate_limited",
        },
    )


@app.get("/api/health")
async def health() -> dict[str, bool | str]:
    return {"ok": True, "version": content.version()}


static_dir = BASE_DIR / "app" / "static"
static_dir.mkdir(parents=True, exist_ok=True)

app.mount("/static", VersionedStaticFiles(directory=static_dir), name="static")


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


# ---------- crawler files ----------

_XML = "application/xml; charset=utf-8"


@app.get("/robots.txt", include_in_schema=False)
async def robots() -> Response:
    return PlainTextResponse(seo.robots_txt(), headers={"Cache-Control": "public, max-age=3600"})


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_index() -> Response:
    return Response(seo.sitemap_index(), media_type=_XML, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/sitemaps/{name}.xml", include_in_schema=False)
async def sitemap_part(name: str) -> Response:
    body = seo.sitemap(name)
    if body is None:
        return Response("not found", status_code=404, media_type="text/plain")
    return Response(body, media_type=_XML, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/llms.txt", include_in_schema=False)
async def llms() -> Response:
    return PlainTextResponse(seo.llms_txt(), headers={"Cache-Control": "public, max-age=3600"})


@app.get("/llms-full.txt", include_in_schema=False)
async def llms_full() -> Response:
    return PlainTextResponse(seo.llms_full_txt(), headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/seo/head", include_in_schema=False)
async def seo_head(path: str = "/", lang: str = "en") -> Response:
    """Head tags for a path - the app applies them after in-app navigation."""
    data = seo.head_json(path[:300], "ml" if lang == "ml" else "en")
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/shell", include_in_schema=False)
async def shell() -> Response:
    """The bare app shell (no page content) - the service worker caches this
    as its offline fallback for every page URL."""
    resp = render_page(static_dir=static_dir, name="index.html")
    resp.headers["X-Robots-Tag"] = "noindex"
    return resp


# ---------- every page: server-rendered content inside the app shell ----------

@app.get("/{path:path}", include_in_schema=False)
async def page(path: str, request: Request) -> Response:
    if path.startswith(("api/", "static/", "models/")):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    lang = "ml" if request.query_params.get("lang") == "ml" else "en"
    clean = "/" + path.strip("/")
    if path.endswith("/") and clean != "/":
        q = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(clean + q, status_code=301)
    pg = seo.resolve(clean, lang) or seo.not_found(lang)
    return HTMLResponse(seo.inject(shell_markup(static_dir), pg, lang), status_code=pg.status,
                        headers={"Cache-Control": "no-cache"})
