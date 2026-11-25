"""Learning-content store: JSON datasets under app/data, loaded once."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from app.config import BASE_DIR

DATA_DIR = BASE_DIR / "app" / "data"


def _load(name: str) -> Any:
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def meta() -> dict:
    return _load("meta.json")


@lru_cache(maxsize=1)
def version() -> str:
    return str(meta().get("contentVersion", "dev"))


@lru_cache(maxsize=1)
def signs() -> list[dict]:
    return _load("signs.json")


@lru_cache(maxsize=1)
def sign_svgs() -> dict[str, str]:
    return _load("sign_svgs.json")


@lru_cache(maxsize=1)
def categories() -> list[dict]:
    return _load("categories.json")


@lru_cache(maxsize=1)
def topics() -> list[dict]:
    return _load("topics.json")


@lru_cache(maxsize=1)
def questions() -> list[dict]:
    return _load("questions.json")


@lru_cache(maxsize=1)
def glossary() -> list[list[str]]:
    return _load("glossary.json")


@lru_cache(maxsize=1)
def ui() -> dict[str, list[str]]:
    table = _load("ui.json")
    extra_path = DATA_DIR / "ui_extra.json"
    if extra_path.is_file():
        table.update(_load("ui_extra.json"))
    return table


@lru_cache(maxsize=1)
def primer_svgs() -> list[str]:
    """The eight 'how to read a sign' icons shown in the Learn primer."""
    return _load("primer.json")


@lru_cache(maxsize=1)
def sign_by_id() -> dict[str, dict]:
    return {d["id"]: d for d in signs()}


@lru_cache(maxsize=1)
def cat_by_id() -> dict[str, dict]:
    return {c["id"]: c for c in categories()}


@lru_cache(maxsize=1)
def topic_by_id() -> dict[str, dict]:
    return {t["id"]: t for t in topics()}


def article(topic_id: str) -> Optional[dict]:
    """Load one article file on demand (articles are large)."""
    if not topic_id or "/" in topic_id or "\\" in topic_id or ".." in topic_id:
        return None
    path = DATA_DIR / "articles" / f"{topic_id}.json"
    if not path.is_file():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def signs_in_category(cat: str) -> list[dict]:
    if cat in ("", "all"):
        return signs()
    return [d for d in signs() if d["cat"] == cat]


def question_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for q in questions():
        counts[q["t"]] = counts.get(q["t"], 0) + 1
    return counts


def content_index() -> dict:
    cats = []
    for c in categories():
        cats.append({**c, "count": len(signs_in_category(c["id"]))})
    return {
        "version": version(),
        "categories": cats,
        "signs": signs(),  # text only — SVGs are fetched lazily
        "topics": topics(),
        "ui": ui(),
        "primer": primer_svgs(),
        "glossaryCount": len(glossary()),
        "questionCounts": question_counts(),
    }


def glossary_search(q: str) -> list[list[str]]:
    q = q.strip().lower()
    if not q:
        return glossary()
    return [g for g in glossary() if q in " ".join(g).lower()]


def warm() -> None:
    """Eagerly load all datasets at startup so first requests are fast."""
    for fn in (signs, sign_svgs, categories, topics, questions, glossary, ui):
        fn()
