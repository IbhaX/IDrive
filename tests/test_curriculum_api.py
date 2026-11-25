"""Curriculum / library / instructor HTTP contract."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.services import instructor


def test_outline_and_lesson(client) -> None:
    r = client.get("/api/curriculum")
    assert r.status_code == 200
    body = r.json()
    assert body["counts"]["modules"] == 12
    first = body["lessonOrder"][0]
    r2 = client.get(f"/api/curriculum/lessons/{first}")
    assert r2.status_code == 200
    les = r2.json()["lesson"]
    assert les["id"] == first and les["check"]
    assert client.get("/api/curriculum/lessons/does-not-exist").status_code == 404


def test_search_endpoint(client) -> None:
    r = client.get("/api/curriculum/search", params={"q": "seat belt"})
    assert r.status_code == 200
    assert r.json()["results"]
    assert client.get("/api/curriculum/search", params={"q": "x" * 81}).status_code == 422


def test_library_endpoints(client) -> None:
    lights = client.get("/api/library/lights").json()["lights"]
    assert any(x["severity"] == "stop" for x in lights)
    assert client.get("/api/library/vehicle").json()["parts"]
    assert client.get("/api/library/scenarios").json()["scenarios"]
    refs = client.get("/api/library/references").json()["references"]
    assert all(x["url"].startswith("https://") for x in refs)


def test_instructor_guest_gets_search_mode(client) -> None:
    r = client.post("/api/instructor/ask", json={"question": "What does the oil light mean?"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "search" and body["answer"] is None
    assert body["sources"][0]["kind"] in {"light", "sign", "lesson"}


def test_instructor_validates_input(client) -> None:
    assert client.post("/api/instructor/ask", json={"question": "x"}).status_code == 422


def test_instructor_ai_mode_with_mock_provider() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        payload = json.loads(request.content)
        seen["system"] = payload["messages"][0]["content"]
        seen["user"] = payload["messages"][-1]["content"]
        return httpx.Response(200, json={"choices": [{"message": {"content": "Stop and switch off [1]."}}]})

    out = asyncio.run(instructor.ask(
        "oil pressure light", [], api_key="k", base_url="https://example.test/v1",
        model="m", allow_ai=True, transport=httpx.MockTransport(handler),
    ))
    assert out["mode"] == "ai"
    assert out["answer"].startswith("Stop")
    assert out["sources"][0]["cited"] is True
    assert seen["url"] == "https://example.test/v1/chat/completions"
    assert "Never invent" in str(seen["system"])
    assert "SOURCES:" in str(seen["user"])


def test_instructor_falls_back_on_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    out = asyncio.run(instructor.ask(
        "brake failure", [], api_key="k", base_url="https://example.test/v1",
        model="m", allow_ai=True, transport=httpx.MockTransport(handler),
    ))
    assert out["mode"] == "search" and out["reason"] == "provider_error"
    assert out["sources"]


@pytest.mark.parametrize("path", ["/home", "/course", "/vehicle", "/science", "/hazard", "/ask"])
def test_new_spa_paths_serve_shell(client, path: str) -> None:
    r = client.get(path)
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]


def test_openrouter_env_names_configure_instructor(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "some/model")
    get_settings.cache_clear()
    try:
        s = get_settings()
        assert s.ai_api_key == "sk-or-test"
        assert s.ai_model == "some/model"
        assert s.ai_base_url == "https://openrouter.ai/api/v1"
    finally:
        get_settings.cache_clear()


def test_instructor_sends_openrouter_headers() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update({k.lower(): v for k, v in request.headers.items()})
        seen["model"] = json.loads(request.content)["model"]
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok [1]"}}]})

    asyncio.run(instructor.ask(
        "seat belt", [], api_key="sk-or-x", base_url="https://openrouter.ai/api/v1",
        model="some/model", allow_ai=True, site_url="https://idrive.example",
        transport=httpx.MockTransport(handler),
    ))
    assert seen["authorization"] == "Bearer sk-or-x"
    assert seen["x-title"] == "iDrive"
    assert seen["http-referer"] == "https://idrive.example"
    assert seen["model"] == "some/model"


def test_app_build_is_embedded_and_echoed(client) -> None:
    html = client.get("/").text
    assert '<meta name="app-build" content="' in html
    build = html.split('<meta name="app-build" content="', 1)[1].split('"', 1)[0]
    r = client.get("/api/curriculum")
    assert r.headers["X-App-Build"] == build


def test_icons_and_manifest_are_served(client) -> None:
    for path, kind in [("/favicon.ico", "image/"), ("/apple-touch-icon.png", "image/png"),
                       ("/manifest.webmanifest", "application/manifest+json"),
                       ("/static/img/favicon.svg", "image/svg"), ("/static/img/icon-512.png", "image/png")]:
        r = client.get(path)
        assert r.status_code == 200 and r.headers["content-type"].startswith(kind), path
    html = client.get("/").text
    assert 'rel="manifest"' in html and "og:image" in html and 'class="bmark"' in html


def test_service_worker_is_served_from_root_with_build(client) -> None:
    r = client.get("/sw.js")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/javascript")
    assert r.headers.get("Service-Worker-Allowed") == "/"
    assert "__BUILD__" not in r.text and "idrive-shell-" in r.text
