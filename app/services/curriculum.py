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
    "following": "Following-distance lab",
    "cornering": "Cornering-grip lab",
    "energy": "Crash-energy lab",
    "headlights": "Headlight-reach lab",
    "blindspot": "Mirrors and blind spots",
    "aquaplaning": "Aquaplaning lab",
    "tyrepressure": "Tyre-pressure lab",
    "slope": "Braking-on-a-slope lab",
    "abs": "ABS lab",
    "weighttransfer": "Weight-transfer lab",
    "fog": "Fog-driving lab",
    "eyesoff": "Eyes-off-the-road lab",
    "truckzones": "Truck and bus blind-zone lab",
    "seatbelt": "Seat-belt lab",
    "helmet": "Helmet lab",
    "rollover": "Rollover lab",
    "gears": "Gears lab",
    "economy": "Fuel-economy lab",
    "drag": "Air-resistance lab",
    "regen": "Regenerative-braking lab",
    "ghat": "Ghat-road brakes lab",
    "overtaking": "Overtaking lab",
    "traveltime": "Speed-versus-time lab",
    "offtracking": "Long-vehicle turning lab",
    "trafficwave": "Phantom-jam lab",
}
LIBRARIES: dict[str, str] = {
    "lights": "Warning-light encyclopedia",
    "vehicle": "Interactive vehicle explorer",
}
_ML_FIXED: dict[str, str] = {
    "lab:stopping": "നിർത്താനുള്ള ദൂരം — ലാബ്",
    "lab:reaction": "പ്രതികരണ സമയ പരിശോധന",
    "lab:engine": "ഫോർ-സ്ട്രോക്ക് എൻജിൻ",
    "lab:following": "പിന്തുടരൽ അകലം — ലാബ്",
    "lab:cornering": "വളവിലെ ഗ്രിപ്പ് — ലാബ്",
    "lab:energy": "ഇടിയുടെ ഊർജം — ലാബ്",
    "lab:headlights": "ഹെഡ്‌ലൈറ്റിന്റെ ദൂരം — ലാബ്",
    "lab:blindspot": "കണ്ണാടികളും ബ്ലൈൻഡ് സ്പോട്ടുകളും",
    "lab:aquaplaning": "അക്വാപ്ലെയിനിങ് — ലാബ്",
    "lab:tyrepressure": "ടയർ മർദ്ദം — ലാബ്",
    "lab:slope": "ചരിവിൽ ബ്രേക്കിങ് — ലാബ്",
    "lab:abs": "ABS — ലാബ്",
    "lab:weighttransfer": "ഭാരമാറ്റം — ലാബ്",
    "lab:fog": "മൂടൽമഞ്ഞ് — ലാബ്",
    "lab:eyesoff": "കണ്ണ് റോഡിൽ നിന്ന് മാറുമ്പോൾ — ലാബ്",
    "lab:truckzones": "ട്രക്ക്, ബസ് ബ്ലൈൻഡ് മേഖലകൾ — ലാബ്",
    "lab:seatbelt": "സീറ്റ് ബെൽറ്റ് — ലാബ്",
    "lab:helmet": "ഹെൽമെറ്റ് — ലാബ്",
    "lab:rollover": "മറിയാനുള്ള സാധ്യത — ലാബ്",
    "lab:gears": "ഗിയർ — ലാബ്",
    "lab:economy": "ഇന്ധനവും വേഗവും — ലാബ്",
    "lab:drag": "വായു പ്രതിരോധം — ലാബ്",
    "lab:regen": "റീജനറേറ്റീവ് ബ്രേക്കിങ് — ലാബ്",
    "lab:ghat": "ഘാട്ട് റോഡും ബ്രേക്കും — ലാബ്",
    "lab:overtaking": "ഓവർടേക്കിങ് — ലാബ്",
    "lab:traveltime": "അമിതവേഗം മുതലാകുമോ — ലാബ്",
    "lab:offtracking": "നീളമുള്ള വാഹനങ്ങൾ തിരിയുമ്പോൾ — ലാബ്",
    "lab:trafficwave": "കാരണമില്ലാത്ത ട്രാഫിക് ജാം — ലാബ്",
    "library:lights": "മുന്നറിയിപ്പ് ലൈറ്റ് വിജ്ഞാനകോശം",
    "library:vehicle": "ഇന്ററാക്ടീവ് വാഹന പര്യവേക്ഷണം",
    "exam:mock": "മുഴുവൻ മോക്ക് പരീക്ഷ",
    "practice:signs": "പരിശീലനം: ചിഹ്ന ചോദ്യങ്ങൾ",
    "signs:all": "ചിഹ്ന ലൈബ്രറി: 255 ചിഹ്നങ്ങളും",
}
ML_DIR = CURRICULUM_DIR / "ml"
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
    kind: Literal["car", "bike", "ped", "truck", "bus", "cow", "dog", "auto", "cycle", "ball"]
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
    cat: Literal["ped", "two", "junc", "hwy", "heavy", "rural", "wx", "town"] = "town"
    mood: Optional[Literal["night", "rain", "fog"]] = None
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


def item_title_ml(item: str) -> Optional[str]:
    """Malayalam title for an item, or None when no translation exists."""
    if item in _ML_FIXED:
        return _ML_FIXED[item]
    kind, _, ref = item.partition(":")
    c = _content()
    if kind == "lesson":
        return _ml_text(("lesson", ref, "title"))
    if kind == "article":
        t = c.topic_by_id().get(ref)
        return t["name"][1] if t else None
    if kind == "practice":
        t = c.topic_by_id().get(ref)
        return f"പരിശീലനം: {t['name'][1]}" if t else None
    if kind == "signs":
        cat = c.cat_by_id().get(ref)
        return f"ചിഹ്ന ലൈബ്രറി: {cat['ml'][0]}" if cat and cat.get("ml") else None
    if kind == "scenario":
        t = _ml_text(("scenario", ref, "title"))
        return f"അപകട സാഹചര്യം: {t}" if t else None
    return None


def _pair(en: str, ml: Optional[str]) -> Any:
    return [en, ml] if ml else en


def _item_out(item: str) -> dict[str, Any]:
    kind, _, ref = item.partition(":")
    out: dict[str, Any] = {"ref": item, "type": kind, "id": ref,
                           "title": _pair(item_title(item) or item, item_title_ml(item))}
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
            "id": m.id, "n": m.n,
            "title": _pair(m.title, _ml_text(("module", m.id, "title"))),
            "summary": _pair(m.summary, _ml_text(("module", m.id, "summary"))),
            "accent": m.accent, "icon": m.icon, "level": m.level,
            "lessonCount": len(m.lessons),
            "minutes": sum(x.minutes for x in m.lessons),
            "chapters": [
                {"id": c.id, "title": _pair(c.title, _ml_text(("chapter", m.id, c.id))),
                 "items": [_item_out(i) for i in c.items]}
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
        "lesson": bilingual(les.model_dump(), ml_lesson(les.id), LESSON_SKIP),
        "module": {"id": mod.id, "n": mod.n, "title": _pair(mod.title, _ml_text(("module", mod.id, "title"))),
                   "accent": mod.accent},
        "references": [{"id": r, **refs[r].model_dump()} for r in les.refs if r in refs],
        "related": [_item_out(x) for x in les.related],
        "prev": order[i - 1] if i > 0 else None,
        "next": order[i + 1] if 0 <= i < len(order) - 1 else None,
    }


# ---------- Malayalam overlay ----------
# app/data/curriculum/ml/<module id>.json mirrors each module's text:
#   {"module": {"title", "summary"}, "chapters": {chapter id: title},
#    "lessons": {lesson id: <same shape as the lesson, text fields only>}}
# ml/library.json holds {"lights": {id: {...}}, "parts": {...}, "scenarios": {...}}.
# `bilingual()` zips English and Malayalam into [en, ml] pairs, which the
# frontend renders with I18n.BP (en / ml / both). Coverage is linted.

LESSON_SKIP: frozenset[str] = frozenset({"id", "level", "minutes", "a", "related", "refs", "verified", "lab", "scenario", "kind"})
LIGHT_SKIP: frozenset[str] = frozenset({"id", "sign", "colour", "severity"})
PART_SKIP: frozenset[str] = frozenset({"id", "group", "x", "y", "related", "lessons"})
SCEN_SKIP: frozenset[str] = frozenset({"id", "layout", "cat", "mood", "duration", "actors", "hazard", "ok", "lesson"})


@lru_cache(maxsize=1)
def _ml_modules() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    if ML_DIR.is_dir():
        for p in ML_DIR.glob("m*.json"):
            out[p.stem] = _read(p)
    return out


@lru_cache(maxsize=1)
def _ml_library() -> dict[str, Any]:
    p = ML_DIR / "library.json"
    return _read(p) if p.is_file() else {}


@lru_cache(maxsize=1)
def _ml_lessons() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for mod in _ml_modules().values():
        out.update(mod.get("lessons", {}))
    return out


def ml_lesson(lesson_id: str) -> dict[str, Any]:
    return _ml_lessons().get(lesson_id, {})


def _ml_text(key: tuple[str, str, str]) -> Optional[str]:
    kind, a, b = key
    if kind == "module":
        v = _ml_modules().get(a, {}).get("module", {}).get(b)
    elif kind == "chapter":
        v = _ml_modules().get(a, {}).get("chapters", {}).get(b)
    elif kind == "lesson":
        v = ml_lesson(a).get(b)
    elif kind == "scenario":
        v = _ml_library().get("scenarios", {}).get(a, {}).get(b)
    else:
        v = None
    return v if isinstance(v, str) and v.strip() else None


def bilingual(en: Any, ml: Any, skip: frozenset[str]) -> Any:
    """Zip an English structure with its Malayalam mirror into [en, ml] pairs."""
    if isinstance(en, str):
        return [en, ml] if isinstance(ml, str) and ml.strip() else en
    if isinstance(en, list):
        if not isinstance(ml, list) or len(ml) != len(en):
            return en
        return [bilingual(a, b, skip) for a, b in zip(en, ml)]
    if isinstance(en, dict):
        mld = ml if isinstance(ml, dict) else {}
        return {k: (v if k in skip else bilingual(v, mld.get(k), skip)) for k, v in en.items()}
    return en


def _missing(en: Any, ml: Any, skip: frozenset[str], path: str, out: list[str]) -> None:
    if isinstance(en, str):
        if en.strip() and not (isinstance(ml, str) and ml.strip()):
            out.append(path)
    elif isinstance(en, list):
        if not isinstance(ml, list) or len(ml) != len(en):
            if any(isinstance(x, (str, list, dict)) for x in en):
                out.append(path + f" (expected list of {len(en)})")
            return
        for i, (a, b) in enumerate(zip(en, ml)):
            _missing(a, b, skip, f"{path}[{i}]", out)
    elif isinstance(en, dict):
        mld = ml if isinstance(ml, dict) else {}
        for k, v in en.items():
            if k not in skip and v is not None:
                _missing(v, mld.get(k), skip, f"{path}.{k}", out)


def ml_coverage() -> list[str]:
    """Paths of English text with no Malayalam translation (empty = complete)."""
    out: list[str] = []
    for m in modules():
        mm = _ml_modules().get(m.id, {})
        for f in ("title", "summary"):
            if not (mm.get("module", {}).get(f) or "").strip():
                out.append(f"{m.id}.module.{f}")
        for c in m.chapters:
            if not (mm.get("chapters", {}).get(c.id) or "").strip():
                out.append(f"{m.id}.chapters.{c.id}")
        for les in m.lessons:
            _missing(les.model_dump(), ml_lesson(les.id), LESSON_SKIP, f"lesson:{les.id}", out)
    lib = _ml_library()
    for w in warning_lights():
        _missing(w.model_dump(), lib.get("lights", {}).get(w.id), LIGHT_SKIP, f"light:{w.id}", out)
    for p in vehicle_parts():
        _missing(p.model_dump(), lib.get("parts", {}).get(p.id), PART_SKIP, f"part:{p.id}", out)
    for sc in scenarios():
        _missing(sc.model_dump(), lib.get("scenarios", {}).get(sc.id), SCEN_SKIP, f"scenario:{sc.id}", out)
    return out


def lights_payload() -> list[Any]:
    lib = _ml_library().get("lights", {})
    return [bilingual(w.model_dump(), lib.get(w.id), LIGHT_SKIP) for w in warning_lights()]


def parts_payload() -> list[Any]:
    lib = _ml_library().get("parts", {})
    return [bilingual(p.model_dump(), lib.get(p.id), PART_SKIP) for p in vehicle_parts()]


def scenarios_payload() -> list[Any]:
    lib = _ml_library().get("scenarios", {})
    return [bilingual(sc.model_dump(), lib.get(sc.id), SCEN_SKIP) for sc in scenarios()]


def _flat_ml(x: Any) -> str:
    if isinstance(x, str):
        return x
    if isinstance(x, list):
        return " ".join(_flat_ml(i) for i in x)
    if isinstance(x, dict):
        return " ".join(_flat_ml(v) for v in x.values())
    return ""


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
def _search_docs() -> list[dict[str, str]]:  # noqa: C901 — flat list builder
    """Flattened documents for search and for instructor retrieval."""
    docs: list[dict[str, str]] = []
    for les, mod in lessons_by_id().values():
        body = " ".join(
            [les.intro, *les.objectives]
            + [" ".join([s.h, *s.p, *s.steps, s.note.text if s.note else ""]) for s in les.sections]
            + [" ".join(t) for t in les.terms] + les.mistakes + les.safety + les.examples
        )
        mll = ml_lesson(les.id)
        docs.append({"kind": "lesson", "id": les.id, "title": les.title, "title_ml": mll.get("title", ""),
                     "group": f"Module {mod.n}: {mod.title}", "body": body, "body_ml": _flat_ml(mll),
                     "href": f"#lesson/{les.id}"})
    c = _content()
    for t in c.topics():
        a = c.article(t["id"])
        if not a:
            continue
        body = " ".join([a["intro"][0]] + [s["h"][0] + " " + " ".join(p[0] for p in s["p"]) for s in a["sections"]])
        body_ml = " ".join([a["intro"][1]] + [s["h"][1] + " " + " ".join(p[1] for p in s["p"]) for s in a["sections"]])
        docs.append({"kind": "article", "id": t["id"], "title": t["name"][0], "title_ml": t["name"][1],
                     "group": "Theory article", "body": body, "body_ml": body_ml, "href": f"#theory/{t['id']}"})
    for d in c.signs():
        ml = d.get("ml") or ["", "", ""]
        docs.append({"kind": "sign", "id": d["id"], "title": d["name"], "title_ml": ml[0], "group": "Road sign",
                     "body": d["meaning"] + " " + d["action"], "body_ml": ml[1] + " " + ml[2], "href": f"#sign/{d['id']}"})
    for g in c.glossary():
        docs.append({"kind": "term", "id": g[0], "title": g[0], "title_ml": g[1], "group": "Glossary",
                     "body": g[2], "body_ml": g[3], "href": "#theory/gloss"})
    lib = _ml_library()
    for w in warning_lights():
        mw = lib.get("lights", {}).get(w.id, {})
        docs.append({"kind": "light", "id": w.id, "title": w.name, "title_ml": mw.get("name", ""), "group": "Warning light",
                     "body": " ".join([w.means, w.why, w.drive, *w.action, w.ignored]), "body_ml": _flat_ml(mw),
                     "href": f"#vehicle/lights/{w.id}"})
    for p in vehicle_parts():
        mp = lib.get("parts", {}).get(p.id, {})
        docs.append({"kind": "part", "id": p.id, "title": p.name, "title_ml": mp.get("name", ""), "group": "Vehicle part",
                     "body": " ".join([p.what, p.how, p.fails]), "body_ml": _flat_ml(mp), "href": f"#vehicle/explore/{p.id}"})
    return docs


_STOP: frozenset[str] = frozenset(
    "a an and are as at be by can do does for from how i if in is it me my of on or should "
    "the this to what when where which who why will with you your".split()
)

_KIND_WEIGHT: dict[str, float] = {"lesson": 1.3, "light": 1.2, "part": 1.1, "article": 1.0, "sign": 0.9, "term": 0.8}
_GROUP_ML: dict[str, str] = {"Theory article": "തിയറി ലേഖനം", "Road sign": "റോഡ് ചിഹ്നം", "Glossary": "പദാവലി",
                             "Warning light": "മുന്നറിയിപ്പ് ലൈറ്റ്", "Vehicle part": "വാഹന ഭാഗം"}
_ML_CHARS = re.compile(r"[\u0d00-\u0d7f]")


def search(q: str, limit: int = 30) -> list[dict[str, Any]]:
    qn = _norm(q)
    if len(qn) < 2:
        return []
    words = [w for w in re.findall(r"[a-z0-9\u0d00-\u0d7f]+", qn) if len(w) > 1 and w not in _STOP]
    if not words:
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    is_ml = bool(_ML_CHARS.search(qn))
    for d in _search_docs():
        title = (d.get("title_ml", "") if is_ml else d["title"]).lower()
        body = (d.get("body_ml", "") if is_ml else d["body"]).lower()
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
        grp_ml = _GROUP_ML.get(d["group"], "")
        if d["kind"] == "lesson":
            grp_ml = d["group"].replace("Module", "മൊഡ്യൂൾ")
        scored.append((score, {
            "kind": d["kind"], "id": d["id"],
            "title": _pair(d["title"], d.get("title_ml") or None),
            "group": _pair(d["group"], grp_ml or None),
            "href": d["href"],
            "snippet": _snippet(d["body_ml"] if is_ml else d["body"], words[0] if words else qn),
        }))
    scored.sort(key=lambda x: -x[0])
    return [x[1] for x in scored[:limit]]


def search_docs() -> list[dict[str, str]]:
    return _search_docs()


@lru_cache(maxsize=1)
def search_index() -> list[dict[str, str]]:
    """Compact copy of the search documents for on-device (offline) search.
    Same fields the server search uses, with the Malayalam group label filled in."""
    out: list[dict[str, str]] = []
    for d in _search_docs():
        grp_ml = _GROUP_ML.get(d["group"], "")
        if d["kind"] == "lesson":
            grp_ml = d["group"].replace("Module", "മൊഡ്യൂൾ")
        out.append({
            "kind": d["kind"], "id": d["id"], "href": d["href"],
            "title": d["title"], "title_ml": d.get("title_ml", ""),
            "group": d["group"], "group_ml": grp_ml,
            "body": d["body"][:1500], "body_ml": d.get("body_ml", "")[:1500],
        })
    return out


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
    _ml_modules()
    _ml_library()
    modules()
    lessons_by_id()
    references()
    warning_lights()
    vehicle_parts()
    scenarios()
