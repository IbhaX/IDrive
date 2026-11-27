from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.main import app
from app.services import content, curriculum, exams, instructor
from app.web import seo


def test_hindi_curriculum_is_complete() -> None:
    assert curriculum.hi_coverage() == []
    assert len(curriculum._hi_modules()) == 12
    assert len(curriculum._hi_lessons()) == 38


def test_hindi_content_pairs_and_search() -> None:
    signs = content.signs()
    assert signs and len(signs[0].get("hi", [])) == 3
    assert re.search(r"[\u0900-\u097f]", signs[0]["hi"][0])
    assert curriculum.search("सुरक्षा")
    assert any(d.get("title_hi") for d in curriculum.search_docs())


def test_hindi_speed_limits_and_glossary() -> None:
    speed = curriculum.speed_limits_payload()["kerala"]
    assert len(speed["roads"][0]["t"]) == 6
    assert re.search(r"[\u0900-\u097f]", speed["roads"][0]["t"][3])
    entry = content.glossary()[0]
    assert entry[6] and entry[7]
    assert re.search(r"[\u0900-\u097f]", entry[7])


def test_hindi_sign_quiz_pairs() -> None:
    q = exams.sign_q(content.signs()[0], __import__("random").Random(3), "name")
    assert len(q["q"]) == 6
    assert len(q["o"][0]) == 6
    assert len(q["r"]) == 6


def test_hindi_instructor_retrieves_hindi_sources() -> None:
    sources = instructor.retrieve("सड़क सुरक्षा", language="hi")
    assert sources
    assert any(re.search(r"[\u0900-\u097f]", source["text"]) for source in sources)


def test_hindi_seo_and_app_routes() -> None:
    page = seo.resolve("/sign/stop", "hi")
    assert page and page.status == 200
    client = TestClient(app)
    response = client.get("/sign/stop?lang=hi")
    assert response.status_code == 200
    assert '<html lang="hi">' in response.text
    assert re.search(r"[\u0900-\u097f]", response.text)
