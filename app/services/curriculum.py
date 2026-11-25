"""Curriculum store: authored JSON under app/data/curriculum, validated once.

Unlike the extracted datasets in app/data/*.json, these files are the source
of truth and are edited by hand. `validate()` is the content linter that the
test-suite runs; the loaders below raise on schema errors so a malformed file
fails at startup rather than in front of a learner.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

CURRICULUM_DIR = Path(__file__).resolve().parent.parent / "data" / "curriculum"

Level = Literal["beginner", "foundation", "intermediate", "advanced"]
LEVELS: tuple[str, ...] = ("beginner", "foundation", "intermediate", "advanced")
ITEM_TYPES: tuple[str, ...] = (
    "lesson", "article", "lab", "scenario", "library", "signs", "practice", "exam",
)
LABS: dict[str, str] = {
    "stopping": "Stopping-distance lab",
    "reaction": "Reaction-time test",
    "engine": "Four-stroke engine",
}
LIBRARIES: dict[str, str] = {
    "lights": "Warning-light encyclopedia",
    "vehicle": "Interactive vehicle explorer",
}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ---------- schema ----------

class Note(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["safety", "law", "tip", "model"]
    text: str


class Section(BaseModel):
    model_config = ConfigDict(extra="forbid")
    h: str
    p: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    note: Optional[Note] = None


class CheckQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str
    o: list[str] = Field(min_length=2, max_length=6)
    a: int
    r: str

    @field_validator("a")
    @classmethod
    def _answer_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("answer index must be >= 0")
        return v


class Lesson(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    level: Level
    minutes: int = Field(ge=1, le=60)
    objectives: list[str] = Field(min_length=1)
    intro: str
    sections: list[Section] = Field(min_length=1)
    terms: list[list[str]] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)
    mistakes: list[str] = Field(default_factory=list)
    safety: list[str] = Field(default_factory=list)
    deep: Optional[str] = None
    check: list[CheckQuestion] = Field(min_length=1)
    related: list[str] = Field(default_factory=list)
    refs: list[str] = Field(default_factory=list)
    verified: str
    lab: Optional[str] = None
    scenario: Optional[str] = None


class Chapter(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    items: list[str] = Field(min_length=1)


class Module(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    n: int
    title: str
    summary: str
    accent: str
    icon: str
    level: Level
    chapters: list[Chapter] = Field(min_length=1)
    lessons: list[Lesson] = Field(default_factory=list)


class Reference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    publisher: str
    url: str
    kind: Literal["law", "official", "service", "standard", "news"]
    scope: Literal["national", "kerala"]
    verified: str
    note: Optional[str] = None


class WarningLight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    sign: str
    name: str
    colour: Literal["red", "amber", "green", "blue"]
    severity: Literal["stop", "soon", "info"]
    means: str
    why: str
    drive: str
    action: list[str] = Field(min_length=1)
    ignored: str
    causes: list[str] = Field(min_length=1)
    pro: str


class VehiclePart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    group: Literal["powertrain", "transmission", "chassis", "electrical", "safety"]
    x: float
    y: float
    what: str
    how: str
    when: str
    fails: str
    related: list[str] = Field(default_factory=list)
    lessons: list[str] = Field(default_factory=list)


class Actor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["car", "bike", "ped", "truck", "bus", "cow", "dog"]
    color: Optional[str] = None
    x: float
    y: float
    tx: float
    ty: float
    then: list[float] = Field(min_length=2, max_length=2)
    rot: float = 0
    brake: bool = False


class Choice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    t: str
    ok: bool
    why: str


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    layout: Literal["straight", "crossing", "junction", "dual"]
    brief: str
    duration: float = Field(gt=0, le=10)
    actors: list[Actor] = Field(min_length=1)
    hazard: str
    question: str
    choices: list[Choice] = Field(min_length=2, max_length=5)
    lesson: Optional[str] = None


# ---------- loaders ----------

def _read(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def modules() -> list[Module]:
    out = [Module.model_validate(_read(p)) for p in sorted((CURRICULUM_DIR / "modules").glob("*.json"))]
    return sorted(out, key=lambda m: m.n)


@lru_cache(maxsize=1)
def lessons_by_id() -> dict[str, tuple[Lesson, Module]]:
    idx: dict[str, tuple[Lesson, Module]] = {}
    for m in modules():
        for lesson in m.lessons:
            if lesson.id in idx:
                raise ValueError(f"duplicate lesson id {lesson.id}")
            idx[lesson.id] = (lesson, m)
    return idx


@lru_cache(maxsize=1)
def references() -> dict[str, Reference]:
    raw: dict[str, Any] = _read(CURRICULUM_DIR / "references.json")
    return {k: Reference.model_validate(v) for k, v in raw.items()}


@lru_cache(maxsize=1)
def warning_lights() -> list[WarningLight]:
    return [WarningLight.model_validate(x) for x in _read(CURRICULUM_DIR / "warning_lights.json")]


@lru_cache(maxsize=1)
def vehicle_parts() -> list[VehiclePart]:
    return [VehiclePart.model_validate(x) for x in _read(CURRICULUM_DIR / "vehicle_parts.json")]


@lru_cache(maxsize=1)
def scenarios() -> list[Scenario]:
    return [Scenario.model_validate(x) for x in _read(CURRICULUM_DIR / "scenarios.json")]


@lru_cache(maxsize=1)
def scenario_by_id() -> dict[str, Scenario]:
    return {s.id: s for s in scenarios()}


def lesson(lesson_id: str) -> Optional[tuple[Lesson, Module]]:
    return lessons_by_id().get(lesson_id)


def module(module_id: str) -> Optional[Module]:
    return next((m for m in modules() if m.id == module_id), None)


# ---------- item resolution (needs the extracted content store) ----------

def _content() -> Any:
    from app.services import content  # local import: content pulls app.config

    return content


def item_title(item: str) -> Optional[str]:
    """Human title for a 'type:id' item, or None if it does not resolve."""
    kind, _, ref = item.partition(":")
    if kind == "lesson":
        hit = lesson(ref)
        return hit[0].title if hit else None
    if kind == "article":
        t = _content().topic_by_id().get(ref)
        return t["name"][0] if t and _content().article(ref) is not None else None
    if kind == "practice":
        if ref == "signs":
            return "Practice: sign questions"
        t = _content().topic_by_id().get(ref)
        return f"Practice: {t['name'][0]}" if t else None
    if kind == "signs":
        if ref == "all":
            return "Sign library: all 255 signs"
        c = _content().cat_by_id().get(ref)
        return f"Sign library: {c['name']}" if c else None
    if kind == "lab":
        return LABS.get(ref)
    if kind == "library":
        return LIBRARIES.get(ref)
    if kind == "scenario":
        s = scenario_by_id().get(ref)
        return f"Hazard scenario: {s.title}" if s else None
    if kind == "exam":
        return "Full mock exam" if ref == "mock" else None
    return None


def _item_out(item: str) -> dict[str, Any]:
    kind, _, ref = item.partition(":")
    out: dict[str, Any] = {"ref": item, "type": kind, "id": ref, "title": item_title(item) or item}
    if kind == "lesson":
        hit = lesson(ref)
        if hit:
            out["minutes"] = hit[0].minutes
            out["level"] = hit[0].level
    return out


def catalogue() -> dict[str, Any]:
    """Outline for the client: modules → chapters → resolved items (no bodies)."""
    mods: list[dict[str, Any]] = []
    for m in modules():
        mods.append({
            "id": m.id, "n": m.n, "title": m.title, "summary": m.summary,
            "accent": m.accent, "icon": m.icon, "level": m.level,
            "lessonCount": len(m.lessons),
            "minutes": sum(x.minutes for x in m.lessons),
            "chapters": [
                {"id": c.id, "title": c.title, "items": [_item_out(i) for i in c.items]}
                for c in m.chapters
            ],
        })
    return {
        "levels": list(LEVELS),
        "modules": mods,
        "lessonOrder": [lid for m in modules() for c in m.chapters for i in c.items
                        if (lid := i.partition(":")[2]) and i.startswith("lesson:")],
        "counts": {
            "modules": len(mods),
            "lessons": len(lessons_by_id()),
            "lights": len(warning_lights()),
            "parts": len(vehicle_parts()),
            "scenarios": len(scenarios()),
        },
    }


def lesson_payload(lesson_id: str) -> Optional[dict[str, Any]]:
    hit = lesson(lesson_id)
    if hit is None:
        return None
    les, mod = hit
    refs = references()
    order = catalogue()["lessonOrder"]
    i = order.index(les.id) if les.id in order else -1
    return {
        "lesson": les.model_dump(),
        "module": {"id": mod.id, "n": mod.n, "title": mod.title, "accent": mod.accent},
        "references": [{"id": r, **refs[r].model_dump()} for r in les.refs if r in refs],
        "related": [_item_out(x) for x in les.related],
        "prev": order[i - 1] if i > 0 else None,
        "next": order[i + 1] if 0 <= i < len(order) - 1 else None,
    }


# ---------- search ----------

def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def _snippet(text: str, q: str, width: int = 140) -> str:
    low = text.lower()
    i = low.find(q)
    if i < 0:
        return text[:width] + ("…" if len(text) > width else "")
    start = max(0, i - width // 3)
    s = text[start:start + width]
    return ("…" if start else "") + s + ("…" if start + width < len(text) else "")


@lru_cache(maxsize=1)
def _search_docs() -> list[dict[str, str]]:
    """Flattened documents for search and for instructor retrieval."""
    docs: list[dict[str, str]] = []
    for les, mod in lessons_by_id().values():
        body = " ".join(
            [les.intro, *les.objectives]
            + [" ".join([s.h, *s.p, *s.steps, s.note.text if s.note else ""]) for s in les.sections]
            + [" ".join(t) for t in les.terms] + les.mistakes + les.safety + les.examples
        )
        docs.append({"kind": "lesson", "id": les.id, "title": les.title,
                     "group": f"Module {mod.n}: {mod.title}", "body": body, "href": f"#lesson/{les.id}"})
    c = _content()
    for t in c.topics():
        a = c.article(t["id"])
        if not a:
            continue
        body = " ".join([a["intro"][0]] + [s["h"][0] + " " + " ".join(p[0] for p in s["p"]) for s in a["sections"]])
        docs.append({"kind": "article", "id": t["id"], "title": t["name"][0],
                     "group": "Theory article", "body": body, "href": f"#theory/{t['id']}"})
    for d in c.signs():
        docs.append({"kind": "sign", "id": d["id"], "title": d["name"], "group": "Road sign",
                     "body": d["meaning"] + " " + d["action"], "href": f"#sign/{d['id']}"})
    for g in c.glossary():
        docs.append({"kind": "term", "id": g[0], "title": g[0], "group": "Glossary",
                     "body": g[2], "href": "#theory/gloss"})
    for w in warning_lights():
        docs.append({"kind": "light", "id": w.id, "title": w.name, "group": "Warning light",
                     "body": " ".join([w.means, w.why, w.drive, *w.action, w.ignored]),
                     "href": f"#vehicle/lights/{w.id}"})
    for p in vehicle_parts():
        docs.append({"kind": "part", "id": p.id, "title": p.name, "group": "Vehicle part",
                     "body": " ".join([p.what, p.how, p.fails]), "href": f"#vehicle/explore/{p.id}"})
    return docs


_STOP: frozenset[str] = frozenset(
    "a an and are as at be by can do does for from how i if in is it me my of on or should "
    "the this to what when where which who why will with you your".split()
)

_KIND_WEIGHT: dict[str, float] = {"lesson": 1.3, "light": 1.2, "part": 1.1, "article": 1.0, "sign": 0.9, "term": 0.8}


def search(q: str, limit: int = 30) -> list[dict[str, Any]]:
    qn = _norm(q)
    if len(qn) < 2:
        return []
    words = [w for w in re.findall(r"[a-z0-9]+", qn) if len(w) > 1 and w not in _STOP]
    if not words:
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    for d in _search_docs():
        title, body = d["title"].lower(), d["body"].lower()
        score = 0.0
        if qn in title:
            score += 10 + (5 if title.startswith(qn) else 0)
        if qn in body:
            score += 4
        matched = 0
        for w in words:
            if w in title or w in body:
                matched += 1
            if w in title:
                score += 3
            score += min(body.count(w), 5) * 0.6
        if len(words) > 1:
            score *= 0.4 + 0.6 * matched / len(words)  # reward covering more of the query
        if score <= 0:
            continue
        score *= _KIND_WEIGHT.get(d["kind"], 1.0)
        scored.append((score, {
            "kind": d["kind"], "id": d["id"], "title": d["title"], "group": d["group"],
            "href": d["href"], "snippet": _snippet(d["body"], words[0] if words else qn),
        }))
    scored.sort(key=lambda x: -x[0])
    return [x[1] for x in scored[:limit]]


def search_docs() -> list[dict[str, str]]:
    return _search_docs()


# ---------- linter ----------

def validate() -> list[str]:
    """Return a list of human-readable content errors (empty when clean)."""
    errs: list[str] = []
    refs = references()
    les_idx = lessons_by_id()
    parts = {p.id for p in vehicle_parts()}
    for r_id, r in refs.items():
        if not _DATE.match(r.verified):
            errs.append(f"reference {r_id}: bad verified date")
        if not r.url.startswith("https://"):
            errs.append(f"reference {r_id}: url must be https")
    seen_modules: set[int] = set()
    for m in modules():
        if m.n in seen_modules:
            errs.append(f"module {m.id}: duplicate number {m.n}")
        seen_modules.add(m.n)
        listed = {i.partition(":")[2] for c in m.chapters for i in c.items if i.startswith("lesson:")}
        for les in m.lessons:
            if les.id not in listed:
                errs.append(f"lesson {les.id}: not listed in any chapter of {m.id}")
        for c in m.chapters:
            for i in c.items:
                kind = i.partition(":")[0]
                if kind not in ITEM_TYPES:
                    errs.append(f"{m.id}/{c.id}: unknown item type in {i}")
                elif item_title(i) is None:
                    errs.append(f"{m.id}/{c.id}: unresolved item {i}")
    for les, _m in les_idx.values():
        if not _DATE.match(les.verified):
            errs.append(f"lesson {les.id}: bad verified date")
        for q in les.check:
            if q.a >= len(q.o):
                errs.append(f"lesson {les.id}: answer index out of range in '{q.q[:40]}'")
        for t in les.terms:
            if len(t) != 2:
                errs.append(f"lesson {les.id}: term must be [term, definition]")
        for r in les.refs:
            if r not in refs:
                errs.append(f"lesson {les.id}: unknown reference {r}")
        for rel in les.related:
            if item_title(rel) is None:
                errs.append(f"lesson {les.id}: unresolved related item {rel}")
        if les.lab and les.lab not in LABS:
            errs.append(f"lesson {les.id}: unknown lab {les.lab}")
        if les.scenario and les.scenario not in scenario_by_id():
            errs.append(f"lesson {les.id}: unknown scenario {les.scenario}")
        has_law = any(s.note and s.note.kind == "law" for s in les.sections)
        if has_law and not les.refs:
            errs.append(f"lesson {les.id}: legal note without references")
    sign_ids = set(_content().sign_by_id())
    for w in warning_lights():
        if w.sign not in sign_ids:
            errs.append(f"light {w.id}: unknown sign {w.sign}")
    for p in vehicle_parts():
        for r in p.related:
            if r not in parts:
                errs.append(f"part {p.id}: unknown related part {r}")
        for lid in p.lessons:
            if lid not in les_idx:
                errs.append(f"part {p.id}: unknown lesson {lid}")
    for s in scenarios():
        if s.hazard not in {a.id for a in s.actors}:
            errs.append(f"scenario {s.id}: hazard {s.hazard} is not an actor")
        if sum(1 for c in s.choices if c.ok) != 1:
            errs.append(f"scenario {s.id}: exactly one choice must be correct")
        if s.lesson and s.lesson not in les_idx:
            errs.append(f"scenario {s.id}: unknown lesson {s.lesson}")
    return errs


def warm() -> None:
    modules()
    lessons_by_id()
    references()
    warning_lights()
    vehicle_parts()
    scenarios()
