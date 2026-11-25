"""Quick end-to-end smoke check against the ASGI app (no server needed).

Covers the happy path: health, content index, a sign, auth lifecycle, a
server-built mock exam submitted and scored, and a progress write.

    python tools/smoke.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# throwaway database so the smoke run never touches real data
os.environ["database_url"] = f"sqlite+aiosqlite:///{Path(tempfile.mkdtemp()) / 'smoke.db'}"
os.environ.setdefault("rate_limit_default", "100000/minute")
os.environ.setdefault("rate_limit_auth", "100000/minute")

# ensure `import app` resolves to this repo, not whatever is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

CHECKS: list[str] = []


def check(name: str, cond: bool) -> None:
    CHECKS.append(("PASS" if cond else "FAIL") + " " + name)
    if not cond:
        print("\n".join(CHECKS))
        sys.exit(1)


with TestClient(app) as c:
    r = c.get("/api/health")
    check("health", r.status_code == 200 and r.json()["ok"])

    idx = c.get("/api/content/index").json()
    check("index counts", len(idx["signs"]) == 255 and len(idx["categories"]) == 9)

    s = c.get("/api/content/signs/stop")
    check("sign + svg", s.status_code == 200 and s.json()["svg"].startswith("<svg"))

    reg = c.post("/api/auth/register", json={
        "email": "smoke@idrive.dev", "password": "smoke-password-1", "name": "Smoke"})
    check("register", reg.status_code == 201)
    h = {"Authorization": "Bearer " + reg.json()["token"]}

    quiz = c.post("/api/quiz/signs", json={"cat": "all", "length": 5}, headers=h)
    check("sign quiz", len(quiz.json()["questions"]) == 5)

    mock = c.post("/api/exam/mock", headers=h)
    check("mock paper", mock.status_code == 201 and len(mock.json()["questions"]) == 30)
    check("answers withheld", all("a" not in q for q in mock.json()["questions"]))

    sub = c.post(f"/api/exam/{mock.json()['exam_id']}/submit",
                 json={"answers": [0] * 30}, headers=h)
    check("mock scored", sub.status_code == 200 and "score" in sub.json())

    put = c.put("/api/progress", json={"data": {"seen": {"stop": 1}}, "version": 0}, headers=h)
    check("progress write", put.status_code == 200)

    cur = c.get("/api/curriculum").json()
    check("curriculum outline", cur["counts"]["modules"] == 12 and cur["lessonOrder"])
    les = c.get(f"/api/curriculum/lessons/{cur['lessonOrder'][0]}")
    check("lesson payload", les.status_code == 200 and les.json()["lesson"]["check"])
    check("search", bool(c.get("/api/curriculum/search", params={"q": "oil pressure"}).json()["results"]))
    check("warning lights", len(c.get("/api/library/lights").json()["lights"]) >= 17)
    ask = c.post("/api/instructor/ask", json={"question": "what does ABS do"}, headers=h)
    check("instructor answers", ask.status_code == 200 and ask.json()["sources"])

    check("index page", c.get("/").status_code == 200)

print("\n".join(CHECKS))
print(f"\n{len(CHECKS)} checks passed.")
