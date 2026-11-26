"""Admin panel API: who can use it, and the rules it enforces."""

from __future__ import annotations

import pytest

from app.config import get_settings

PW = "long-enough-password"


def _register(client, email: str, name: str = "") -> dict[str, str]:
    r = client.post("/api/auth/register", json={"email": email, "password": PW, "name": name or email.split("@")[0]})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def boss(client, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """An admin by ADMIN_EMAILS."""
    monkeypatch.setenv("admin_emails", "boss@example.com")
    get_settings.cache_clear()
    return _register(client, "boss@example.com", "Boss")


def _uid(client, headers: dict[str, str]) -> int:
    return client.get("/api/auth/me", headers=headers).json()["id"]


def test_admin_api_needs_an_admin(client, boss) -> None:
    assert client.get("/api/admin/users").status_code == 401
    pupil = _register(client, "pupil@example.com")
    r = client.get("/api/admin/users", headers=pupil)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "admin_required"
    me = client.get("/api/auth/me", headers=boss).json()
    assert me["role"] == "admin"
    assert client.get("/api/auth/me", headers=pupil).json()["role"] == "user"


def test_list_search_filter_and_overview(client, boss) -> None:
    for i in range(3):
        _register(client, f"learner{i}@example.com", f"Learner {i}")
    r = client.get("/api/admin/users", headers=boss)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 4 and len(body["users"]) == 4
    row = next(u for u in body["users"] if u["email"] == "boss@example.com")
    assert row["role"] == "admin" and row["envAdmin"] is True and row["status"] == "active"
    assert row["provider"] == "password" and row["sessions"] >= 1 and "lessons" in row["progress"]
    r = client.get("/api/admin/users", params={"q": "learner 1"}, headers=boss)
    assert [u["email"] for u in r.json()["users"]] == ["learner1@example.com"]
    r = client.get("/api/admin/users", params={"role": "admin"}, headers=boss)
    assert [u["email"] for u in r.json()["users"]] == ["boss@example.com"]
    r = client.get("/api/admin/users", params={"sort": "email", "order": "asc", "size": 2}, headers=boss)
    assert [u["email"] for u in r.json()["users"]] == ["boss@example.com", "learner0@example.com"]
    ov = client.get("/api/admin/overview", headers=boss).json()
    assert ov["stats"]["users"] == 4 and ov["stats"]["admins"] == 1 and ov["stats"]["new7"] == 4
    assert isinstance(ov["recent"], list)


def test_promote_and_demote(client, boss) -> None:
    helper = _register(client, "helper@example.com")
    hid = _uid(client, helper)
    r = client.patch(f"/api/admin/users/{hid}", json={"role": "admin"}, headers=boss)
    assert r.status_code == 200 and r.json()["role"] == "admin"
    assert client.get("/api/admin/users", headers=helper).status_code == 200   # a promoted admin can use the panel
    r = client.patch(f"/api/admin/users/{hid}", json={"role": "user"}, headers=boss)
    assert r.json()["role"] == "user"
    assert client.get("/api/admin/users", headers=helper).status_code == 403


def test_block_signs_out_and_stops_sign_in(client, boss) -> None:
    pupil = _register(client, "pupil@example.com")
    pid = _uid(client, pupil)
    r = client.patch(f"/api/admin/users/{pid}", json={"status": "blocked"}, headers=boss)
    assert r.status_code == 200 and r.json()["status"] == "blocked"
    assert client.get("/api/auth/me", headers=pupil).status_code == 401
    r = client.post("/api/auth/login", json={"email": "pupil@example.com", "password": PW})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "account_blocked"
    # wrong password still gives the generic answer (no account probing)
    r = client.post("/api/auth/login", json={"email": "pupil@example.com", "password": "wrong-password-here"})
    assert r.status_code == 401
    client.patch(f"/api/admin/users/{pid}", json={"status": "active"}, headers=boss)
    assert client.post("/api/auth/login", json={"email": "pupil@example.com", "password": PW}).status_code == 200


def test_sign_out_everywhere_and_delete(client, boss) -> None:
    pupil = _register(client, "pupil@example.com")
    pid = _uid(client, pupil)
    r = client.post(f"/api/admin/users/{pid}/signout", headers=boss)
    assert r.status_code == 200 and r.json()["sessions"] >= 1
    assert client.get("/api/auth/me", headers=pupil).status_code == 401
    assert client.delete(f"/api/admin/users/{pid}", headers=boss).status_code == 200
    assert client.post("/api/auth/login", json={"email": "pupil@example.com", "password": PW}).status_code == 401
    assert client.delete(f"/api/admin/users/{pid}", headers=boss).status_code == 404


def test_guard_rails(client, boss) -> None:
    bid = _uid(client, boss)
    for call in (lambda: client.patch(f"/api/admin/users/{bid}", json={"status": "blocked"}, headers=boss),
                 lambda: client.patch(f"/api/admin/users/{bid}", json={"role": "user"}, headers=boss),
                 lambda: client.delete(f"/api/admin/users/{bid}", headers=boss)):
        r = call()
        assert r.status_code == 400 and r.json()["detail"]["code"] == "self"
    other = _register(client, "other@example.com")
    oid = _uid(client, other)
    client.patch(f"/api/admin/users/{oid}", json={"role": "admin"}, headers=boss)
    # an ADMIN_EMAILS admin cannot be demoted, blocked or deleted from the panel
    for call in (lambda: client.patch(f"/api/admin/users/{bid}", json={"role": "user"}, headers=other),
                 lambda: client.patch(f"/api/admin/users/{bid}", json={"status": "blocked"}, headers=other),
                 lambda: client.delete(f"/api/admin/users/{bid}", headers=other)):
        r = call()
        assert r.status_code == 400 and r.json()["detail"]["code"] == "env_admin"
    assert client.patch(f"/api/admin/users/{oid}", json={"role": "owner"}, headers=boss).status_code == 422
    assert client.patch("/api/admin/users/99999", json={"status": "blocked"}, headers=boss).status_code == 404
