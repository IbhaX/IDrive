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
