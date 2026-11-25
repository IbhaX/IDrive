"""Curriculum content linter + service behaviour (no HTTP, no database)."""

from __future__ import annotations

import re

from app.services import curriculum


def test_content_is_clean() -> None:
    errs = curriculum.validate()
    assert errs == [], "\n".join(errs)


def test_twelve_modules_in_order() -> None:
    mods = curriculum.modules()
    assert [m.n for m in mods] == list(range(1, 13))
    for m in mods:
        assert m.chapters, m.id
        assert re.match(r"^#[0-9a-f]{6}$", m.accent), m.id


def test_every_lesson_has_the_teaching_parts() -> None:
    for les, _m in curriculum.lessons_by_id().values():
        assert les.objectives and les.intro and les.sections, les.id
        assert les.check, les.id
        assert les.mistakes or les.safety, les.id


def test_no_fine_amounts_in_curriculum() -> None:
    """Content policy: penalties change too often to hard-code."""
    money = re.compile(r"(₹|\bRs\.?\s?\d|\brupees?\b)", re.I)
    for les, _m in curriculum.lessons_by_id().values():
        blob = les.model_dump_json()
        assert not money.search(blob), f"money amount in lesson {les.id}"
    for w in curriculum.warning_lights():
        assert not money.search(w.model_dump_json()), w.id


def test_legal_claims_cite_verified_sources() -> None:
    refs = curriculum.references()
    for les, _m in curriculum.lessons_by_id().values():
        if any(s.note and s.note.kind == "law" for s in les.sections):
            assert les.refs, les.id
            for r in les.refs:
                assert refs[r].verified, r


def test_catalogue_resolves_titles_and_order() -> None:
    cat = curriculum.catalogue()
    assert cat["counts"]["modules"] == 12
    assert cat["counts"]["lessons"] == len(cat["lessonOrder"])
    for m in cat["modules"]:
        for c in m["chapters"]:
            for it in c["items"]:
                assert it["title"] != it["ref"], it["ref"]


def test_lesson_payload_links_neighbours_and_references() -> None:
    order = curriculum.catalogue()["lessonOrder"]
    p = curriculum.lesson_payload(order[1])
    assert p is not None
    assert p["prev"] == order[0]
    assert p["next"] == order[2]
    safety = curriculum.lesson_payload("safety-laws")
    assert safety is not None
    assert {r["id"] for r in safety["references"]} >= {"mvact", "cmvr"}
    assert curriculum.lesson_payload("nope") is None


def test_search_ranks_obvious_hits_first() -> None:
    assert curriculum.search("oil pressure")[0]["id"] == "oil"
    assert curriculum.search("hydroplaning")[0]["kind"] == "lesson"
    assert curriculum.search("x") == []
    kinds = {r["kind"] for r in curriculum.search("brake", limit=40)}
    assert {"lesson", "light", "part"} <= kinds


def test_scenarios_have_one_correct_choice() -> None:
    for s in curriculum.scenarios():
        assert sum(c.ok for c in s.choices) == 1, s.id
        assert s.hazard in {a.id for a in s.actors}
