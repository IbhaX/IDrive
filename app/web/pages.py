"""Serve the SPA shell and versioned static assets (adapted from the
FreeLLMChat reference: HTML gets `no-cache`, fingerprinted assets get
immutable caching)."""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from starlette.responses import HTMLResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

_ASSET_ATTRIBUTE = re.compile(
    r'''(?P<prefix>\b(?:src|href)\s*=\s*)(?P<quote>["'])'''
    r'''(?P<url>/static/[^"']+)(?P=quote)'''
)


@lru_cache(maxsize=512)
def _digest(path: str, modified_ns: int, size: int) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:20]


def asset_version(path: Path) -> str:
    stat = path.stat()
    return _digest(str(path), stat.st_mtime_ns, stat.st_size)


def asset_url(url: str, static_dir: Path) -> str:
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path.startswith("/static/"):
        return url
    path = (static_dir / parts.path.removeprefix("/static/")).resolve()
    if not path.is_relative_to(static_dir.resolve()) or not path.is_file():
        return url
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != "v"]
    query.append(("v", asset_version(path)))
    return urlunsplit(("", "", parts.path, urlencode(query), parts.fragment))


def render_page(name: str, static_dir: Path) -> HTMLResponse:
    path = (static_dir / name).resolve()
    if not path.is_relative_to(static_dir.resolve()) or path.suffix != ".html":
        raise ValueError("Invalid page path")
    markup = path.read_text(encoding="utf-8")
    markup = _ASSET_ATTRIBUTE.sub(
        lambda m: (
            f"{m['prefix']}{m['quote']}{asset_url(m['url'], static_dir)}{m['quote']}"
        ),
        markup,
    )
    return HTMLResponse(markup, headers={"Cache-Control": "no-cache"})


class VersionedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        query = dict(parse_qsl(scope.get("query_string", b"").decode("latin-1")))
        if self.directory is not None and response.status_code in (200, 304):
            full_path = (Path(self.directory) / path).resolve()
            if (
                full_path.is_relative_to(Path(self.directory).resolve())
                and full_path.is_file()
                and query.get("v") == asset_version(full_path)
            ):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
