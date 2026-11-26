"""Serve the SPA shell and versioned static assets (adapted from the
FreeLLMChat reference: HTML gets `no-cache`, fingerprinted assets get
immutable caching)."""

from __future__ import annotations

import base64
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


@lru_cache(maxsize=4)
def app_build(static_dir: Path) -> str:
    """Fingerprint of everything the client depends on: static assets plus the
    content datasets. Computed once per process (deploys restart the server).
    Pages embed it; API responses echo it so long-lived tabs can tell when the
    server has moved on and reload instead of mixing old code with new data."""
    h = hashlib.sha256()
    roots = [static_dir, static_dir.parent / "data"]
    for root in roots:
        if not root.is_dir():
            continue
        for f in sorted(root.rglob("*")):
            if f.is_file() and f.suffix in {".js", ".css", ".html", ".json"} and "vendor" not in f.parts:
                h.update(str(f.relative_to(root)).encode())
                h.update(f.read_bytes())
    return h.hexdigest()[:16]


_IMPORTMAP = re.compile(r'<script type="importmap">(.*?)</script>', re.S)


@lru_cache(maxsize=4)
def importmap_hashes(static_dir: Path) -> tuple[str, ...]:
    """CSP hash sources for the inline import map(s) in index.html - the only
    inline script the policy allows (no 'unsafe-inline')."""
    markup = (static_dir / "index.html").read_text(encoding="utf-8")
    return tuple(
        "'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode() + "'"
        for m in _IMPORTMAP.finditer(markup)
    )


def shell_markup(static_dir: Path, name: str = "index.html") -> str:
    """index.html with versioned asset URLs and the build meta."""
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
    markup = markup.replace(
        "</head>", f'<meta name="app-build" content="{app_build(static_dir)}">\n</head>', 1
    )
    return markup


def render_page(name: str, static_dir: Path) -> HTMLResponse:
    return HTMLResponse(shell_markup(static_dir, name), headers={"Cache-Control": "no-cache"})


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
