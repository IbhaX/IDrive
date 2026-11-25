"""API contract tests over a throwaway SQLite database."""

from __future__ import annotations

import pytest

from tests.helpers import answer_key


# ---------- health / content ----------

def test_health(client) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] and r.json()["version"]


def test_content_index_counts_and_etag(client) -> None:
    r = client.get("/api/content/index")
    assert r.status_code == 200
    body = r.json()
    assert len(body["signs"]) == 255
    assert len(body["categories"]) == 9
    assert len(body["topics"]) == 18
    assert len(body["primer"]) == 8
    assert body["glossaryCount"] == 83
    assert "svg" not in body["signs"][0]  # index stays light
    etag = r.headers.get("etag")
    assert etag
    r2 = client.get("/api/content/index", headers={"If-None-Match": etag})
    assert r2.status_code == 304


def test_sign_and_svgs(client) -> None:
    r = client.get("/api/content/signs/stop")
    assert r.status_code == 200
    assert r.json()["svg"].lstrip().startswith("<svg")
    assert client.get("/api/content/signs/nope").status_code == 404
    r2 = client.get("/api/content/svgs", params={"cat": "mand"})
    assert len(r2.json()) == 46


def test_theory_and_glossary(client) -> None:
    r = client.get("/api/content/theory/rules")
    assert r.status_code == 200 and r.json()["article"]["intro"]
    assert client.get("/api/content/theory/nope").status_code == 404
    g = client.get("/api/content/glossary").json()["entries"]
    assert len(g) == 83
    g2 = client.get("/api/content/glossary", params={"q": "carriageway"}).json()["entries"]
    assert 0 < len(g2) < 83


# ---------- auth ----------

def test_auth_lifecycle(client) -> None:
    r = client.post("/api/auth/register", json={
        "email": "A@Example.com", "password": "long-enough-password", "name": "A"})
    assert r.status_code == 201
    tok = r.json()["token"]
    assert r.json()["user"]["email"] == "a@example.com"  # normalised
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200 and me.json()["name"] == "A"
    # duplicate email
    r2 = client.post("/api/auth/register", json={
        "email": "a@example.com", "password": "long-enough-password"})
    assert r2.status_code == 400
    # logout then me → 401
    client.post("/api/auth/logout", headers={"Authorization": f"Bearer {tok}"})
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


def test_login_never_reveals(client) -> None:
    r = client.post("/api/auth/login", json={"email": "ghost@x.com", "password": "whatever12"})
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "bad_credentials"


def test_protected_endpoints_401(client) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/progress").status_code == 401
    assert client.get("/api/exam/attempts").status_code == 401


# ---------- quiz / practice ----------

def test_sign_quiz(client) -> None:
    r = client.post("/api/quiz/signs", json={"cat": "mand", "length": 10})
    assert r.status_code == 200
    qs = r.json()["questions"]
    assert len(qs) == 10
    for q in qs:
        assert q["type"] in ("s2n", "n2s")
        assert "a" in q  # practice-mode answers included by design
        assert q["target"]["id"]


def test_practice_topics(client) -> None:
    r = client.post("/api/exam/practice", json={"topic": "rules"})
    assert r.status_code == 200
    qs = r.json()["questions"]
    assert qs and all(q["t"] == "rules" and "a" in q and "r" in q for q in qs)
    r2 = client.post("/api/exam/practice", json={"topic": "signs"})
    assert len(r2.json()["questions"]) == 15
    assert client.post("/api/exam/practice", json={"topic": "nope"}).status_code == 400


# ---------- mock exam ----------

def test_mock_no_answers_leaked(client) -> None:
    r = client.post("/api/exam/mock")
    assert r.status_code == 201
    qs = r.json()["questions"]
    assert len(qs) == 30
    assert all("a" not in q and "r" not in q for q in qs)
    assert r.json()["deadline_at"]


def test_mock_submit_all_correct(client, db_path) -> None:
    exam_id = client.post("/api/exam/mock").json()["exam_id"]
    key = answer_key(db_path, exam_id)
    r = client.post(f"/api/exam/{exam_id}/submit", json={"answers": key})
    assert r.status_code == 200
    body = r.json()
    assert body["score"] == 30 and body["total"] == 30 and body["passed"] is True
    assert len(body["review"]) == 30
    # idempotent: second submit returns the stored result
    r2 = client.post(f"/api/exam/{exam_id}/submit", json={"answers": [None] * 30})
    assert r2.status_code == 200 and r2.json()["score"] == 30


def test_mock_pass_boundary(client, db_path) -> None:
    # exactly 18 correct passes, 17 fails
    for correct, want in ((18, True), (17, False)):
        exam_id = client.post("/api/exam/mock").json()["exam_id"]
        key = answer_key(db_path, exam_id)
        ans = key[:correct] + [None] * (30 - correct)
        # None where the key points elsewhere could collide — force wrong pick
        for i in range(correct, 30):
            ans[i] = (key[i] + 1) % 4
        body = client.post(f"/api/exam/{exam_id}/submit", json={"answers": ans}).json()
        assert body["score"] == correct
        assert body["passed"] is want


def test_mock_records_attempt_for_user(client, auth_headers) -> None:
    exam_id = client.post("/api/exam/mock", headers=auth_headers).json()["exam_id"]
    client.post(f"/api/exam/{exam_id}/submit", json={"answers": [0] * 30}, headers=auth_headers)
    attempts = client.get("/api/exam/attempts", headers=auth_headers).json()
    assert len(attempts) == 1 and attempts[0]["mode"] == "mock" and attempts[0]["total"] == 30


def test_mock_guest_no_attempt(client) -> None:
    exam_id = client.post("/api/exam/mock").json()["exam_id"]
    r = client.post(f"/api/exam/{exam_id}/submit", json={"answers": [0] * 30})
    assert r.status_code == 200  # guests can sit mocks; nothing is recorded


def test_submit_unknown_paper(client) -> None:
    assert client.post("/api/exam/nope/submit", json={"answers": []}).status_code == 404


# ---------- progress ----------

def test_progress_roundtrip(client, auth_headers) -> None:
    r = client.get("/api/progress", headers=auth_headers)
    assert r.status_code == 200 and r.json()["version"] == 0
    blob = {"seen": {"stop": 1}, "box": {"stop": 2}, "wrong": {}, "best": 80,
            "played": 4, "lang": "en", "mock": {"taken": 1, "passed": 0, "best": 15},
            "tq": {"signs": [3, 5]}, "v": 1}
    r2 = client.put("/api/progress", json={"data": blob, "version": 0}, headers=auth_headers)
    assert r2.status_code == 200 and r2.json()["version"] == 1
    r3 = client.get("/api/progress", headers=auth_headers)
    assert r3.json()["data"]["seen"]["stop"] == 1


def test_progress_conflict(client, auth_headers) -> None:
    h = auth_headers
    client.put("/api/progress", json={"data": {"seen": {}}, "version": 0}, headers=h)
    # stale version → 409 with the server blob
    r = client.put("/api/progress", json={"data": {"seen": {"x": 1}}, "version": 0}, headers=h)
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "progress_conflict" and body["server"]["version"] == 1


def test_progress_reset(client, auth_headers) -> None:
    h = auth_headers
    client.put("/api/progress", json={"data": {"seen": {"stop": 1}}, "version": 0}, headers=h)
    r = client.post("/api/progress/reset", headers=h)
    assert r.status_code == 200 and r.json()["data"] == {}


def test_progress_isolated_per_user(client) -> None:
    for email in ("u1@x.com", "u2@x.com"):
        client.post("/api/auth/register", json={"email": email, "password": "long-enough-password"})
    t1 = client.post("/api/auth/login", json={"email": "u1@x.com", "password": "long-enough-password"}).json()["token"]
    t2 = client.post("/api/auth/login", json={"email": "u2@x.com", "password": "long-enough-password"}).json()["token"]
    client.put("/api/progress", json={"data": {"seen": {"stop": 1}}, "version": 0},
               headers={"Authorization": f"Bearer {t1}"})
    r = client.get("/api/progress", headers={"Authorization": f"Bearer {t2}"})
    assert r.json()["data"] == {}
