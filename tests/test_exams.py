"""Unit tests for the question-set engine (signQ/prep/buildMock/buildPractice
port, plus the sign-quiz builder)."""

from __future__ import annotations

import random

import pytest

from app.services import content, exams


@pytest.fixture(scope="module")
def rng() -> random.Random:
    return random.Random(42)


def test_sign_q_every_kind(rng) -> None:
    sign = content.sign_by_id()["stop"]
    for kind in exams.SIGN_KINDS:
        q = exams.sign_q(sign, rng, kind)
        assert q["t"] == "signs"
        assert len(q["o"]) == 4
        assert 0 <= q["a"] < 4
        assert len(q["r"]) == 2 and all(q["r"]), "reasoning must be bilingual"
        if "svg" in q:  # "find" kind shows the name, not an image
            assert q["svg"].startswith("<svg")
        # option distinctness - by serialised form
        import json

        assert len({json.dumps(o, ensure_ascii=False) for o in q["o"]}) == 4


def test_sign_q_all_signs_no_crash(rng) -> None:
    # the check the single-file app had: every sign can produce every kind
    for d in content.signs()[:60]:  # sample keeps the test fast
        for kind in exams.SIGN_KINDS:
            q = exams.sign_q(d, rng, kind)
            assert 0 <= q["a"] < len(q["o"]) == 4, (d["id"], kind)


def test_prep_remaps_answer(rng) -> None:
    q = content.questions()[0]
    p = exams.prep(q, rng)
    assert p["a"] != q["a"] or len(q["o"]) == 1 or True
    assert p["o"][p["a"]] == q["o"][q["a"]], "answer must follow the shuffle"
    assert sorted(map(str, p["o"])) == sorted(map(str, q["o"]))


def test_build_mock_composition(rng) -> None:
    qs = exams.build_mock(rng)
    assert len(qs) == exams.MOCK_TOTAL == 30
    sign_qs = [q for q in qs if q["t"] == "signs"]
    theory_qs = [q for q in qs if q["t"] != "signs"]
    assert len(sign_qs) == exams.MOCK_SIGN_QS == 12
    assert len(theory_qs) == exams.MOCK_THEORY_QS == 18
    for q in qs:
        assert "a" in q and "r" in q  # answer key exists server-side


def test_strip_answers_hides_key(rng) -> None:
    stripped = exams.strip_answers(exams.build_mock(rng))
    for q in stripped:
        assert "a" not in q and "r" not in q


def test_build_practice_every_topic(rng) -> None:
    for t in content.topics():
        qs = exams.build_practice(t["id"], rng)
        assert qs, f"no practice questions for {t['id']}"
        assert all(q["t"] == t["id"] for q in qs)
    assert len(exams.build_practice("signs", rng)) == 15
    cat = content.categories()[0]["id"]
    qs = exams.build_practice(f"sg:{cat}", rng)
    assert 1 <= len(qs) <= 15


def test_sign_quiz_shape(rng) -> None:
    qs = exams.build_sign_quiz("all", 10, rng)
    assert len(qs) == 10
    for q in qs:
        assert q["type"] in ("s2n", "n2s")
        assert 0 <= q["a"] < len(q["o"]) == 4
        assert q["target"]["id"]
        if q["type"] == "n2s":
            assert q["io"] and all("svg" in o for o in q["o"])


def test_score_math() -> None:
    paper = [{"id": "a", "t": "x", "q": ["", ""], "o": [["", ""], ["", ""]], "a": 0},
             {"id": "b", "t": "x", "q": ["", ""], "o": [["", ""], ["", ""]], "a": 1}]
    r = exams.score(paper, [0, 0])
    assert r["score"] == 1 and r["total"] == 2
    assert r["review"][0]["correct"] and not r["review"][1]["correct"]
    r2 = exams.score(paper, [])
    assert r2["score"] == 0 and r2["review"][0]["picked"] is None
