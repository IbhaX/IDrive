"""Same-origin mirror of the 3D car used by the vehicle explorer.

The "Car Concept" glTF (CC BY 4.0, Eric Chadwick / Khronos glTF Sample Assets)
is published on GitHub. Fetching it straight from raw.githubusercontent.com is
slow or blocked on some Indian networks, so the server keeps a pinned copy in
``data/models/carconcept`` and serves it from its own origin. The copy is made
in the background at startup (or ahead of time with
``python -m app.services.model_mirror``); until it exists the route redirects
to GitHub so the explorer still works.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

import httpx

from app.config import BASE_DIR

log = logging.getLogger("idrive.models")

MODEL_SHA = "e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea"
# The URL path carries the variant and pinned commit. Files are served as
# immutable, so a new model version MUST get a new key - otherwise browsers
# mix cached files of the old version with the new one (that broke loading
# when the model switched from KTX2/Draco to WebP under the same names).
MODEL_KEY = f"carconcept-webp-{MODEL_SHA[:8]}"
UPSTREAM = (
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/"
    f"{MODEL_SHA}/Models/CarConcept/glTF-WEBP/"
)
# name -> exact size in bytes at the pinned commit (doubles as an integrity check)
FILES: dict[str, int] = {
    # the WebP variant: plain geometry + WebP images, so the browser needs no
    # Draco/Basis decoders (WebAssembly workers) to show it
    "CarConcept.gltf": 334313,
    "CarConcept.data.bin": 8670516,
    "Dash_E.webp": 9764,
    "Dot_C.webp": 268,
    "Dot_N.webp": 6438,
    "Hex_N.webp": 3142,
    "Khronos_C.webp": 3414,
    "Mechanical_N.webp": 223440,
    "Mechanical_ORM.webp": 9514,
    "Occlusion.webp": 294098,
    "Powdercoat_N.webp": 36868,
    "Rib_N.webp": 92,
    "Thickness.webp": 25758,
    "Tireside_C.webp": 5538,
    "Tireside_N.webp": 286764,
    "Tiretread_N.webp": 37136,
}
MEDIA: dict[str, str] = {
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".webp": "image/webp",
}
MODEL_DIR: Path = BASE_DIR / "data" / "models" / "carconcept-webp"

_lock = asyncio.Lock()


def local_path(name: str) -> Optional[Path]:
    """Path of a mirrored file if it exists and is complete, else None."""
    if name not in FILES:
        return None
    p = MODEL_DIR / name
    try:
        return p if p.stat().st_size == FILES[name] else None
    except OSError:
        return None


def upstream_url(name: str) -> Optional[str]:
    return UPSTREAM + name if name in FILES else None


def media_type(name: str) -> str:
    return MEDIA.get(Path(name).suffix, "application/octet-stream")


def missing() -> list[str]:
    return [n for n in FILES if local_path(n) is None]


def status() -> dict[str, object]:
    """What the mirror holds - used by the client and for troubleshooting."""
    left = missing()
    return {"complete": not left, "missing": left, "files": len(FILES)}


async def fetch_one(name: str, timeout: float = 45.0) -> Optional[Path]:
    """Make sure one file is mirrored now (used when a student asks for it
    before the background copy has finished). Returns its path or None."""
    if name not in FILES:
        return None
    hit = local_path(name)
    if hit is not None:
        return hit
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as cl:
        try:
            r = await cl.get(UPSTREAM + name)
            r.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("3D model mirror: on-demand fetch of %s failed: %s", name, exc)
            return None
    if len(r.content) != FILES[name]:
        log.warning("3D model mirror: %s has %d bytes, expected %d", name, len(r.content), FILES[name])
        return None
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = MODEL_DIR / (name + ".part")
    tmp.write_bytes(r.content)
    tmp.replace(MODEL_DIR / name)
    return MODEL_DIR / name


async def ensure(client: Optional[httpx.AsyncClient] = None, timeout: float = 60.0) -> bool:
    """Download any missing files. Returns True when the mirror is complete."""
    todo = missing()
    if not todo:
        return True
    async with _lock:
        todo = missing()
        if not todo:
            return True
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        own = client is None
        cl = client or httpx.AsyncClient(timeout=timeout, follow_redirects=True)
        try:
            for name in todo:
                try:
                    r = await cl.get(UPSTREAM + name)
                    r.raise_for_status()
                    data = r.content
                    if len(data) != FILES[name]:
                        log.warning("3D model mirror: %s has %d bytes, expected %d", name, len(data), FILES[name])
                        continue
                    tmp = MODEL_DIR / (name + ".part")
                    tmp.write_bytes(data)
                    tmp.replace(MODEL_DIR / name)
                except (httpx.HTTPError, OSError) as exc:
                    log.warning("3D model mirror: could not fetch %s: %s", name, exc)
        finally:
            if own:
                await cl.aclose()
    left = missing()
    if left:
        log.info("3D model mirror incomplete (%d files missing) - serving redirects", len(left))
    else:
        log.info("3D model mirror ready in %s", MODEL_DIR)
    return not left


if __name__ == "__main__":  # pragma: no cover - build-time helper
    ok = asyncio.run(ensure())
    print("3D model mirror:", "complete" if ok else f"missing {missing()}")
