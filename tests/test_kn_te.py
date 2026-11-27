from __future__ import annotations

import re
from fastapi.testclient import TestClient

from app.main import app
from app.services import content, curriculum, exams, instructor
from app.web import seo


def test_kannada_and_telugu_curriculum_coverage() -> None:
    assert curriculum.extra_coverage("kn") == []
    assert curriculum.extra_coverage("te") == []
    assert len(curriculum._extra_modules("kn")) == 12
    assert len(curriculum._extra_modules("te")) == 12
    assert len(curriculum._extra_lessons("kn")) == 38
    assert len(curriculum._extra_lessons("te")) == 38


def test_signs_categories_and_glossary_have_both_languages() -> None:
    sign = content.signs()[0]
    category = content.categories()[0]
    assert len(sign["kn"]) == 3 and len(sign["te"]) == 3
    assert len(category["kn"]) == 2 and len(category["te"]) == 2
    assert re.search(r"[\u0c80-\u0cff]", sign["kn"][0])
    assert re.search(r"[\u0c00-\u0c7f]", sign["te"][0])
    glossary = content.glossary()[0]
    assert glossary[8] and glossary[9] and glossary[10] and glossary[11]


def test_lesson_payload_and_search_support_both_scripts() -> None:
    lesson = curriculum.lesson_payload("engine-basics")
    assert len(lesson["lesson"]["title"]) == 6
    assert re.search(r"[\u0c80-\u0cff]", lesson["lesson"]["title"][4])
    assert re.search(r"[\u0c00-\u0c7f]", lesson["lesson"]["title"][5])
    assert any(d.get("body_kn") for d in curriculum.search_docs())
    assert any(d.get("body_te") for d in curriculum.search_docs())


def test_sign_exam_questions_have_six_language_slots() -> None:
    q = exams.sign_q(content.signs()[0], __import__("random").Random(7), "name")
    assert len(q["q"]) == 6
    assert len(q["o"][0]) == 6
    assert len(q["r"]) == 6


def test_instructor_retrieval_accepts_kannada_and_telugu() -> None:
    assert instructor.retrieve("ರಸ್ತೆ ಸುರಕ್ಷತೆ", language="kn")
    assert instructor.retrieve("రోడ్డు భద్రత", language="te")


def test_seo_pages_accept_kannada_and_telugu() -> None:
    for lang, pattern in (("kn", r"[\u0c80-\u0cff]"), ("te", r"[\u0c00-\u0c7f]")):
        page = seo.resolve("/sign/stop", lang)
        assert page and page.status == 200
        assert re.search(pattern, page.body)


def test_content_api_exposes_new_sign_languages() -> None:
    client = TestClient(app)
    response = client.get("/api/content/index")
    assert response.status_code == 200
    sign = response.json()["signs"][0]
    assert sign["kn"] and sign["te"]
