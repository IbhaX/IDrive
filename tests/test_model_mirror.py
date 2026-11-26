"""3D car mirror: integrity checks, download, and the serving route."""

from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
import pytest

from app.services import model_mirror as mm


@pytest.fixture()
def tmp_models(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    d = tmp_path / "models"
    monkeypatch.setattr(mm, "MODEL_DIR", d)
    return d


def test_only_known_complete_files_count(tmp_models: Path) -> None:
    tmp_models.mkdir(parents=True)
    (tmp_models / "Rib_N.webp").write_bytes(b"x" * 10)            # truncated
    assert mm.local_path("Rib_N.webp") is None
    (tmp_models / "Rib_N.webp").write_bytes(b"x" * mm.FILES["Rib_N.webp"])
    assert mm.local_path("Rib_N.webp") is not None
    assert mm.local_path("../secret") is None and mm.upstream_url("evil.js") is None
    assert "Rib_N.webp" not in mm.missing()


def test_ensure_downloads_and_rejects_wrong_sizes(tmp_models: Path) -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        name = req.url.path.rsplit("/", 1)[-1]
        assert str(req.url).startswith(mm.UPSTREAM)
        size = mm.FILES[name] - (1 if name == "Dot_C.webp" else 0)   # one bad file
        return httpx.Response(200, content=b"\0" * size)

    async def run() -> bool:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cl:
            return await mm.ensure(cl)

    assert asyncio.run(run()) is False
    assert mm.missing() == ["Dot_C.webp"]
    assert not list(tmp_models.glob("*.part"))


def test_media_types() -> None:
    assert mm.media_type("CarConcept.gltf") == "model/gltf+json"
    assert mm.media_type("Occlusion.webp") == "image/webp"
