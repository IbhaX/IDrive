"""Data-integrity checks over the extracted JSON datasets (mirrors §3.4)."""

from __future__ import annotations

import json
from pathlib import Path
from xml.etree import ElementTree

import pytest

DATA = Path(__file__).resolve().parent.parent / "app" / "data"


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def signs() -> list[dict]:
    return load("signs.json")


@pytest.fixture(scope="module")
def svgs() -> dict[str, str]:
    return load("sign_svgs.json")


@pytest.fixture(scope="module")
def questions() -> list[dict]:
    return load("questions.json")


def test_counts(signs, svgs, questions) -> None:
    assert len(signs) == 255
    assert len(load("categories.json")) == 9
    assert len(load("topics.json")) == 18
    assert len(list((DATA / "articles").glob("*.json"))) == 18
    assert len(questions) == 471
    assert len(load("glossary.json")) == 83
    assert len(load("primer.json")) == 8


def test_every_sign_complete(signs, svgs) -> None:
    ids = set()
    for d in signs:
        assert d["id"] and d["cat"] and d["name"] and d["meaning"] and d["action"]
        assert d["id"] not in ids, "duplicate id"
        ids.add(d["id"])
        assert len(d["ml"]) >= 3 and all(d["ml"]), f"{d['id']} missing Malayalam"
        assert len(d.get("ta", [])) >= 3 and all(d["ta"]), f"{d['id']} missing Tamil"
        assert svgs[d["id"]].lstrip().startswith("<svg")


def test_svgs_parse_as_xml(svgs) -> None:
    for sid, svg in svgs.items():
        ElementTree.fromstring(svg)  # raises on malformed markup


def test_questions_valid(questions) -> None:
    topics = {t["id"] for t in load("topics.json")}
    for q in questions:
        assert q["t"] in topics, f"{q['id']} unknown topic {q['t']}"
        assert len(q["q"]) >= 3 and all(q["q"]), "question text not trilingual"
        assert 0 <= q["a"] < len(q["o"])
        assert len({json.dumps(o, ensure_ascii=False) for o in q["o"]}) == len(q["o"]), "dup options"
        assert len(q["r"]) >= 3 and all(q["r"]), "reasoning not trilingual"
        for o in q["o"]:
            # options are [en, ml] pairs or shared strings (e.g. numbers)
            if isinstance(o, list):
                assert len(o) >= 3 and all(o), f"{q['id']} option not trilingual"
            else:
                assert isinstance(o, str) and o, f"{q['id']} bad option"


def test_articles_bilingual() -> None:
    for p in (DATA / "articles").glob("*.json"):
        a = load("articles/" + p.name)
        assert len(a["intro"]) >= 3 and all(a["intro"]), p.name
        assert isinstance(a["sections"], list) and a["sections"], p.name
        for s in a["sections"]:
            assert len(s["h"]) >= 3 and all(s["h"])
            for para in s["p"]:
                assert len(para) >= 3 and all(para)


def test_ui_every_key_bilingual() -> None:
    for name in ("ui.json", "ui_extra.json"):
        for k, v in load(name).items():
            assert isinstance(v, list) and len(v) >= 3, f"{name}:{k}"


def test_meta_tracks_source() -> None:
    meta = load("meta.json")
    assert meta["contentVersion"]
    assert meta["counts"]["signs"] == 255
