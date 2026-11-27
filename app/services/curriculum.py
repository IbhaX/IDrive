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
    "speedbump": "Speed-breaker lab",
    "hillstart": "Hill-start lab",
    "banking": "Banked-bend lab",
    "bendsight": "Bend sight-line lab",
    "gap": "Gap-judging lab",
    "signal": "Indicator-timing lab",
    "crosswind": "Crosswind lab",
    "lean": "Motorcycle-lean lab",
    "bikebrake": "Two-wheeler braking lab",
    "doorzone": "Door-zone lab",
    "childseat": "Child-seat lab",
    "airbag": "Airbag-distance lab",
    "hotcar": "Parked-car heat lab",
    "microsleep": "Microsleep lab",
    "glare": "Dazzle lab",
    "reversezone": "Reversing blind-zone lab",
    "evrange": "EV-range lab",
    "idling": "Idling lab",
    "coasting": "Lift-off lab",
    "tyresize": "Wheel-size lab",
}
LIBRARIES: dict[str, str] = {
    "lights": "Warning-light encyclopedia",
    "vehicle": "Interactive vehicle explorer",
}
_ML_FIXED: dict[str, str] = {
    "lab:stopping": "നിർത്താനുള്ള ദൂരം - ലാബ്",
    "lab:reaction": "പ്രതികരണ സമയ പരിശോധന",
    "lab:engine": "ഫോർ-സ്ട്രോക്ക് എൻജിൻ",
    "lab:following": "പിന്തുടരൽ അകലം - ലാബ്",
    "lab:cornering": "വളവിലെ ഗ്രിപ്പ് - ലാബ്",
    "lab:energy": "ഇടിയുടെ ഊർജം - ലാബ്",
    "lab:headlights": "ഹെഡ്‌ലൈറ്റിന്റെ ദൂരം - ലാബ്",
    "lab:blindspot": "കണ്ണാടികളും ബ്ലൈൻഡ് സ്പോട്ടുകളും",
    "lab:aquaplaning": "അക്വാപ്ലെയിനിങ് - ലാബ്",
    "lab:tyrepressure": "ടയർ മർദ്ദം - ലാബ്",
    "lab:slope": "ചരിവിൽ ബ്രേക്കിങ് - ലാബ്",
    "lab:abs": "ABS - ലാബ്",
    "lab:weighttransfer": "ഭാരമാറ്റം - ലാബ്",
    "lab:fog": "മൂടൽമഞ്ഞ് - ലാബ്",
    "lab:eyesoff": "കണ്ണ് റോഡിൽ നിന്ന് മാറുമ്പോൾ - ലാബ്",
    "lab:truckzones": "ട്രക്ക്, ബസ് ബ്ലൈൻഡ് മേഖലകൾ - ലാബ്",
    "lab:seatbelt": "സീറ്റ് ബെൽറ്റ് - ലാബ്",
    "lab:helmet": "ഹെൽമെറ്റ് - ലാബ്",
    "lab:rollover": "മറിയാനുള്ള സാധ്യത - ലാബ്",
    "lab:gears": "ഗിയർ - ലാബ്",
    "lab:economy": "ഇന്ധനവും വേഗവും - ലാബ്",
    "lab:drag": "വായു പ്രതിരോധം - ലാബ്",
    "lab:regen": "റീജനറേറ്റീവ് ബ്രേക്കിങ് - ലാബ്",
    "lab:ghat": "ഘാട്ട് റോഡും ബ്രേക്കും - ലാബ്",
    "lab:overtaking": "ഓവർടേക്കിങ് - ലാബ്",
    "lab:traveltime": "അമിതവേഗം മുതലാകുമോ - ലാബ്",
    "lab:offtracking": "നീളമുള്ള വാഹനങ്ങൾ തിരിയുമ്പോൾ - ലാബ്",
    "lab:trafficwave": "കാരണമില്ലാത്ത ട്രാഫിക് ജാം - ലാബ്",
    "lab:speedbump": "സ്പീഡ് ബ്രേക്കർ - ലാബ്",
    "lab:hillstart": "കയറ്റത്തിൽ പുറപ്പെടൽ - ലാബ്",
    "lab:banking": "ചരിവുള്ള വളവ് - ലാബ്",
    "lab:bendsight": "വളവിലെ കാഴ്ചദൂരം - ലാബ്",
    "lab:gap": "വിടവ് വിലയിരുത്തൽ - ലാബ്",
    "lab:signal": "ഇൻഡിക്കേറ്റർ സമയം - ലാബ്",
    "lab:crosswind": "കുറുകെയുള്ള കാറ്റ് - ലാബ്",
    "lab:lean": "ബൈക്ക് ചെരിവ് - ലാബ്",
    "lab:bikebrake": "ഇരുചക്രവാഹന ബ്രേക്കിങ് - ലാബ്",
    "lab:doorzone": "ഡോർ സോൺ - ലാബ്",
    "lab:childseat": "ചൈൽഡ് സീറ്റ് - ലാബ്",
    "lab:airbag": "എയർബാഗ് അകലം - ലാബ്",
    "lab:hotcar": "നിർത്തിയിട്ട കാറിലെ ചൂട് - ലാബ്",
    "lab:microsleep": "മൈക്രോസ്ലീപ്പ് - ലാബ്",
    "lab:glare": "കണ്ണ് മഞ്ഞളിക്കൽ - ലാബ്",
    "lab:reversezone": "പിന്നോട്ടെടുക്കുമ്പോഴുള്ള ബ്ലൈൻഡ് സോൺ - ലാബ്",
    "lab:evrange": "ഇലക്ട്രിക് കാർ റേഞ്ച് - ലാബ്",
    "lab:idling": "ഐഡ്‌ലിങ് - ലാബ്",
    "lab:coasting": "ആക്സിലറേറ്റർ വിടൽ - ലാബ്",
    "lab:tyresize": "വീൽ സൈസ് - ലാബ്",
    "library:lights": "മുന്നറിയിപ്പ് ലൈറ്റ് വിജ്ഞാനകോശം",
    "library:vehicle": "ഇന്ററാക്ടീവ് വാഹന പര്യവേക്ഷണം",
    "exam:mock": "മുഴുവൻ മോക്ക് പരീക്ഷ",
    "practice:signs": "പരിശീലനം: ചിഹ്ന ചോദ്യങ്ങൾ",
    "signs:all": "ചിഹ്ന ലൈബ്രറി: 255 ചിഹ്നങ്ങളും",
}
ML_DIR = CURRICULUM_DIR / "ml"
TA_DIR = CURRICULUM_DIR / "ta"
HI_DIR = CURRICULUM_DIR / "hi"
KN_DIR = CURRICULUM_DIR / "kn"
TE_DIR = CURRICULUM_DIR / "te"
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


@lru_cache(maxsize=1)
def _ta_fixed() -> dict[str, str]:
    p = TA_DIR / "fixed.json"
    return _read(p) if p.is_file() else {}


def item_title_hi(item: str) -> Optional[str]:
    fixed = _hi_fixed().get(item)
    if fixed: return fixed
    kind, _, ref = item.partition(":")
    if kind == "lesson": return _hi_text(("lesson", ref, "title"))
    if kind == "article":
        t = _content().topic_by_id().get(ref); return t["name"][3] if t and len(t["name"]) > 3 else None
    if kind == "practice":
        t = _content().topic_by_id().get(ref); return f"अभ्यास: {t['name'][3]}" if t and len(t["name"]) > 3 else None
    if kind == "signs":
        cat = _content().cat_by_id().get(ref); return f"संकेत पुस्तकालय: {cat['hi'][0]}" if cat and cat.get("hi") else None
    if kind == "scenario": return _hi_text(("scenario", ref, "title"))
    return None


def _extra_title(item: str, lang: str) -> Optional[str]:
    kind, _, ref = item.partition(":")
    fixed = _extra_fixed(lang).get(item)
    if fixed: return fixed
    if kind == "lesson": return _extra_text(lang, ("lesson", ref, "title"))
    if kind == "article":
        t = _content().topic_by_id().get(ref); n = t.get("name", []) if t else []
        return n[4 if lang == "kn" else 5] if len(n) > (4 if lang == "kn" else 5) else None
    if kind == "practice":
        t = _content().topic_by_id().get(ref); n = t.get("name", []) if t else []
        return f"{'ಅಭ್ಯಾಸ' if lang == 'kn' else 'అభ్యాసం'}: {n[4 if lang == 'kn' else 5]}" if len(n) > (4 if lang == "kn" else 5) else None
    if kind == "signs":
        cat = _content().cat_by_id().get(ref); arr = cat.get(lang, []) if cat else []
        return f"{'ಸಂಕೇತಗಳ ಗ್ರಂಥಾಲಯ' if lang == 'kn' else 'సంకేతాల గ్రంథాలయం'}: {arr[0]}" if arr else None
    if kind == "scenario": return _extra_text(lang, ("scenario", ref, "title"))
    return None


def item_title_kn(item: str) -> Optional[str]: return _extra_title(item, "kn")
def item_title_te(item: str) -> Optional[str]: return _extra_title(item, "te")


def item_title_ta(item: str) -> Optional[str]:
    fixed = _ta_fixed().get(item)
    if fixed:
        return fixed
    kind, _, ref = item.partition(":")
    if kind == "lesson":
        return _ta_text(("lesson", ref, "title"))
    if kind == "article":
        t = _content().topic_by_id().get(ref)
        return t["name"][2] if t and len(t["name"]) > 2 else None
    if kind == "practice":
        t = _content().topic_by_id().get(ref)
        return f"பயிற்சி: {t['name'][2]}" if t and len(t["name"]) > 2 else None
    if kind == "signs":
        cat = _content().cat_by_id().get(ref)
        return f"சாலை குறியீடுகள்: {cat['ta'][0]}" if cat and cat.get("ta") else None
    if kind == "scenario":
        return _ta_text(("scenario", ref, "title"))
    return None


def _pair(en: str, ml: Optional[str], ta: Optional[str] = None, hi: Optional[str] = None,
          kn: Optional[str] = None, te: Optional[str] = None) -> Any:
    vals = [en, ml or en, ta or en, hi or en, kn or en, te or en]
    return vals if any(v != en for v in vals[1:]) else en


def _item_out(item: str) -> dict[str, Any]:
    kind, _, ref = item.partition(":")
    out: dict[str, Any] = {"ref": item, "type": kind, "id": ref,
                           "title": _pair(item_title(item) or item, item_title_ml(item), item_title_ta(item), item_title_hi(item), item_title_kn(item), item_title_te(item))}
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
            "title": _pair(m.title, _ml_text(("module", m.id, "title")), _ta_text(("module", m.id, "title")), _hi_text(("module", m.id, "title")), _extra_text("kn", ("module", m.id, "title")), _extra_text("te", ("module", m.id, "title"))),
            "summary": _pair(m.summary, _ml_text(("module", m.id, "summary")), _ta_text(("module", m.id, "summary")), _hi_text(("module", m.id, "summary")), _extra_text("kn", ("module", m.id, "summary")), _extra_text("te", ("module", m.id, "summary"))),
            "accent": m.accent, "icon": m.icon, "level": m.level,
            "lessonCount": len(m.lessons),
            "minutes": sum(x.minutes for x in m.lessons),
            "chapters": [
                {"id": c.id, "title": _pair(c.title, _ml_text(("chapter", m.id, c.id)), _ta_text(("chapter", m.id, c.id)), _hi_text(("chapter", m.id, c.id)), _extra_text("kn", ("chapter", m.id, c.id)), _extra_text("te", ("chapter", m.id, c.id))),
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
        "lesson": hexari(les.model_dump(), ml_lesson(les.id), ta_lesson(les.id), hi_lesson(les.id), _extra_lesson("kn", les.id), _extra_lesson("te", les.id), LESSON_SKIP),
        "module": {"id": mod.id, "n": mod.n, "title": _pair(mod.title, _ml_text(("module", mod.id, "title")), _ta_text(("module", mod.id, "title")), _hi_text(("module", mod.id, "title")), _extra_text("kn", ("module", mod.id, "title")), _extra_text("te", ("module", mod.id, "title"))),
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


@lru_cache(maxsize=1)
def _ta_modules() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    if TA_DIR.is_dir():
        for p in TA_DIR.glob("m*.json"):
            out[p.stem.split("-", 1)[0]] = _read(p)
    return out


@lru_cache(maxsize=1)
def _ta_library() -> dict[str, Any]:
    p = TA_DIR / "library.json"
    return _read(p) if p.is_file() else {}


@lru_cache(maxsize=1)
def _ta_lessons() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for mod in _ta_modules().values():
        out.update(mod.get("lessons", {}))
    return out


def ta_lesson(lesson_id: str) -> dict[str, Any]:
    return _ta_lessons().get(lesson_id, {})


def _ta_text(key: tuple[str, str, str]) -> Optional[str]:
    kind, a, b = key
    if kind == "module":
        v = _ta_modules().get(a, {}).get("module", {}).get(b)
    elif kind == "chapter":
        v = _ta_modules().get(a, {}).get("chapters", {}).get(b)
    elif kind == "lesson":
        v = ta_lesson(a).get(b)
    elif kind == "scenario":
        v = _ta_library().get("scenarios", {}).get(a, {}).get(b)
    else:
        v = None
    return v if isinstance(v, str) and v.strip() else None


@lru_cache(maxsize=1)
def _hi_fixed() -> dict[str, str]:
    p = HI_DIR / "fixed.json"
    return _read(p) if p.is_file() else {}


@lru_cache(maxsize=1)
def _hi_modules() -> dict[str, dict[str, Any]]:
    return {p.stem.split("-", 1)[0]: _read(p) for p in HI_DIR.glob("m*.json")} if HI_DIR.is_dir() else {}


@lru_cache(maxsize=1)
def _hi_library() -> dict[str, Any]:
    p = HI_DIR / "library.json"
    return _read(p) if p.is_file() else {}


@lru_cache(maxsize=1)
def _hi_lessons() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for mod in _hi_modules().values(): out.update(mod.get("lessons", {}))
    return out


def hi_lesson(lesson_id: str) -> dict[str, Any]:
    return _hi_lessons().get(lesson_id, {})


def _hi_text(key: tuple[str, str, str]) -> Optional[str]:
    kind, a, b = key
    if kind == "module": v = _hi_modules().get(a, {}).get("module", {}).get(b)
    elif kind == "chapter": v = _hi_modules().get(a, {}).get("chapters", {}).get(b)
    elif kind == "lesson": v = hi_lesson(a).get(b)
    elif kind == "scenario": v = _hi_library().get("scenarios", {}).get(a, {}).get(b)
    else: v = None
    return v if isinstance(v, str) and v.strip() else None


def _extra_dir(lang: str) -> Path: return KN_DIR if lang == "kn" else TE_DIR

@lru_cache(maxsize=2)
def _extra_fixed(lang: str) -> dict[str, str]:
    p = _extra_dir(lang) / "fixed.json"
    return _read(p) if p.is_file() else {}

@lru_cache(maxsize=2)
def _extra_modules(lang: str) -> dict[str, dict[str, Any]]:
    return {p.stem.split("-", 1)[0]: _read(p) for p in _extra_dir(lang).glob("m*.json")} if _extra_dir(lang).is_dir() else {}

@lru_cache(maxsize=2)
def _extra_library(lang: str) -> dict[str, Any]:
    p = _extra_dir(lang) / "library.json"
    return _read(p) if p.is_file() else {}

@lru_cache(maxsize=2)
def _extra_lessons(lang: str) -> dict[str, dict[str, Any]]:
    out = {}
    for mod in _extra_modules(lang).values(): out.update(mod.get("lessons", {}))
    return out

def _extra_lesson(lang: str, lesson_id: str) -> dict[str, Any]:
    return _extra_lessons(lang).get(lesson_id, {})

def _extra_text(lang: str, key: tuple[str, str, str]) -> Optional[str]:
    kind, a, b = key
    if kind == "module": v = _extra_modules(lang).get(a, {}).get("module", {}).get(b)
    elif kind == "chapter": v = _extra_modules(lang).get(a, {}).get("chapters", {}).get(b)
    elif kind == "lesson": v = _extra_lesson(lang, a).get(b)
    elif kind == "scenario": v = _extra_library(lang).get("scenarios", {}).get(a, {}).get(b)
    else: v = None
    return v if isinstance(v, str) and v.strip() else None

def item_title_hi(item: str) -> Optional[str]: return item_title_ta(item) if False else _hi_fixed().get(item) or _hi_text(("lesson", item.split(":",1)[1], "title")) if item.startswith("lesson:") else _hi_fixed().get(item)

def hexari(en: Any, ml: Any, ta: Any, hi: Any, kn: Any, te: Any, skip: frozenset[str]) -> Any:
    if isinstance(en, str):
        vals = [en] + [v if isinstance(v, str) and v.strip() else en for v in (ml, ta, hi, kn, te)]
        return vals if any(v != en for v in vals[1:]) else en
    if isinstance(en, list):
        sources = [ml, ta, hi, kn, te]
        sources = [v if isinstance(v, list) and len(v) == len(en) else [None] * len(en) for v in sources]
        return [hexari(*items, skip) for items in zip(en, *sources)]
    if isinstance(en, dict):
        sources = [v if isinstance(v, dict) else {} for v in (ml, ta, hi, kn, te)]
        return {k: (v if k in skip else hexari(v, *(src.get(k) for src in sources), skip)) for k, v in en.items()}
    return en


def quadri(en: Any, ml: Any, ta: Any, hi: Any, skip: frozenset[str]) -> Any:
    if isinstance(en, str):
        vals = [en, ml if isinstance(ml, str) and ml.strip() else en,
                ta if isinstance(ta, str) and ta.strip() else en,
                hi if isinstance(hi, str) and hi.strip() else en]
        return vals if any(v != en for v in vals[1:]) else en
    if isinstance(en, list):
        ml = ml if isinstance(ml, list) and len(ml) == len(en) else [None] * len(en)
        ta = ta if isinstance(ta, list) and len(ta) == len(en) else [None] * len(en)
        hi = hi if isinstance(hi, list) and len(hi) == len(en) else [None] * len(en)
        return [quadri(a, b, c, d, skip) for a, b, c, d in zip(en, ml, ta, hi)]
    if isinstance(en, dict):
        md, td, hd = ml if isinstance(ml, dict) else {}, ta if isinstance(ta, dict) else {}, hi if isinstance(hi, dict) else {}
        return {k: (v if k in skip else quadri(v, md.get(k), td.get(k), hd.get(k), skip)) for k, v in en.items()}
    return en


def trilingual(en: Any, ml: Any, ta: Any, skip: frozenset[str]) -> Any:
    if isinstance(en, str):
        return [en, ml if isinstance(ml, str) and ml.strip() else en,
                ta if isinstance(ta, str) and ta.strip() else en] if (
                    (isinstance(ml, str) and ml.strip()) or (isinstance(ta, str) and ta.strip())
                ) else en
    if isinstance(en, list):
        if not isinstance(ml, list) or len(ml) != len(en):
            ml = [None] * len(en)
        if not isinstance(ta, list) or len(ta) != len(en):
            ta = [None] * len(en)
        return [trilingual(a, b, c, skip) for a, b, c in zip(en, ml, ta)]
    if isinstance(en, dict):
        mld = ml if isinstance(ml, dict) else {}
        tad = ta if isinstance(ta, dict) else {}
        return {k: (v if k in skip else trilingual(v, mld.get(k), tad.get(k), skip))
                for k, v in en.items()}
    return en


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


def ta_coverage() -> list[str]:
    """Paths of English curriculum text with no Tamil translation."""
    out: list[str] = []
    for m in modules():
        tm = _ta_modules().get(m.id, {})
        for f in ("title", "summary"):
            if not (tm.get("module", {}).get(f) or "").strip():
                out.append(f"{m.id}.module.{f}")
        for c in m.chapters:
            if not (tm.get("chapters", {}).get(c.id) or "").strip():
                out.append(f"{m.id}.chapters.{c.id}")
        for les in m.lessons:
            _missing(les.model_dump(), ta_lesson(les.id), LESSON_SKIP, f"lesson:{les.id}", out)
    lib = _ta_library()
    for w in warning_lights():
        _missing(w.model_dump(), lib.get("lights", {}).get(w.id), LIGHT_SKIP, f"light:{w.id}", out)
    for part in vehicle_parts():
        _missing(part.model_dump(), lib.get("parts", {}).get(part.id), PART_SKIP, f"part:{part.id}", out)
    for sc in scenarios():
        _missing(sc.model_dump(), lib.get("scenarios", {}).get(sc.id), SCEN_SKIP, f"scenario:{sc.id}", out)
    return out


def extra_coverage(lang: str) -> list[str]:
    out=[]
    for m in modules():
        mm=_extra_modules(lang).get(m.id,{})
        for f in ("title","summary"):
            if not (mm.get("module",{}).get(f) or "").strip(): out.append(f"{m.id}.module.{f}")
        for c in m.chapters:
            if not (mm.get("chapters",{}).get(c.id) or "").strip(): out.append(f"{m.id}.chapters.{c.id}")
        for les in m.lessons: _missing(les.model_dump(),_extra_lesson(lang,les.id),LESSON_SKIP,f"lesson:{les.id}",out)
    lib=_extra_library(lang)
    for w in warning_lights(): _missing(w.model_dump(),lib.get("lights",{}).get(w.id),LIGHT_SKIP,f"light:{w.id}",out)
    for part in vehicle_parts(): _missing(part.model_dump(),lib.get("parts",{}).get(part.id),PART_SKIP,f"part:{part.id}",out)
    for sc in scenarios(): _missing(sc.model_dump(),lib.get("scenarios",{}).get(sc.id),SCEN_SKIP,f"scenario:{sc.id}",out)
    return out


def hi_coverage() -> list[str]:
    out: list[str] = []
    for m in modules():
        hm = _hi_modules().get(m.id, {})
        for f in ("title", "summary"):
            if not (hm.get("module", {}).get(f) or "").strip(): out.append(f"{m.id}.module.{f}")
        for c in m.chapters:
            if not (hm.get("chapters", {}).get(c.id) or "").strip(): out.append(f"{m.id}.chapters.{c.id}")
        for les in m.lessons: _missing(les.model_dump(), hi_lesson(les.id), LESSON_SKIP, f"lesson:{les.id}", out)
    lib = _hi_library()
    for w in warning_lights(): _missing(w.model_dump(), lib.get("lights", {}).get(w.id), LIGHT_SKIP, f"light:{w.id}", out)
    for part in vehicle_parts(): _missing(part.model_dump(), lib.get("parts", {}).get(part.id), PART_SKIP, f"part:{part.id}", out)
    for sc in scenarios(): _missing(sc.model_dump(), lib.get("scenarios", {}).get(sc.id), SCEN_SKIP, f"scenario:{sc.id}", out)
    return out


def lights_payload() -> list[Any]:
    libs = [_ml_library().get("lights", {}), _ta_library().get("lights", {}), _hi_library().get("lights", {}), _extra_library("kn").get("lights", {}), _extra_library("te").get("lights", {})]
    return [hexari(w.model_dump(), *(lib.get(w.id) for lib in libs), LIGHT_SKIP) for w in warning_lights()]


def parts_payload() -> list[Any]:
    libs = [_ml_library().get("parts", {}), _ta_library().get("parts", {}), _hi_library().get("parts", {}), _extra_library("kn").get("parts", {}), _extra_library("te").get("parts", {})]
    return [hexari(p.model_dump(), *(lib.get(p.id) for lib in libs), PART_SKIP) for p in vehicle_parts()]


class SignWhen(BaseModel):
    model_config = ConfigDict(extra="forbid")
    s: str
    d: str


class SignDetail(BaseModel):
    """Rich, hand-written extra content for one road sign (keyed by sign id)."""
    model_config = ConfigDict(extra="forbid")
    more: str
    where: list[str] = Field(min_length=1)
    when: list[SignWhen] = Field(min_length=1)
    mistake: str


@lru_cache(maxsize=1)
def sign_details() -> dict[str, SignDetail]:
    p = CURRICULUM_DIR / "sign_details.json"
    if not p.is_file():
        return {}
    raw: dict[str, Any] = json.loads(p.read_text(encoding="utf-8"))
    return {k: SignDetail.model_validate(v) for k, v in raw.items()}


@lru_cache(maxsize=1)
def _ml_sign_details() -> dict[str, Any]:
    p = ML_DIR / "sign_details.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}


def sign_details_payload() -> dict[str, Any]:
    ml = _ml_sign_details()
    p = TA_DIR / "sign_details.json"
    ta = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}
    hi = json.loads((HI_DIR / "sign_details.json").read_text(encoding="utf-8")) if (HI_DIR / "sign_details.json").is_file() else {}
    kn = json.loads((KN_DIR / "sign_details.json").read_text(encoding="utf-8")) if (KN_DIR / "sign_details.json").is_file() else {}
    te = json.loads((TE_DIR / "sign_details.json").read_text(encoding="utf-8")) if (TE_DIR / "sign_details.json").is_file() else {}
    return {k: hexari(v.model_dump(), ml.get(k), ta.get(k), hi.get(k), kn.get(k), te.get(k), frozenset()) for k, v in sign_details().items()}


def sign_details_missing_ml() -> list[str]:
    out: list[str] = []
    ml = _ml_sign_details()
    for k, v in sign_details().items():
        _missing(v.model_dump(), ml.get(k), frozenset(), f"sign:{k}", out)
    return out


@lru_cache(maxsize=1)
def speed_limits() -> dict[str, Any]:
    """Maximum speeds by vehicle class and road type (Kerala and the central
    notification), with [en, ml] labels inline. Checked by the linter."""
    p = CURRICULUM_DIR / "speed_limits.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}


def speed_limits_payload() -> dict[str, Any]:
    refs = references()
    hi_path = HI_DIR / "speed_limits.json"
    hi_data = _read(hi_path) if hi_path.is_file() else {}
    kn_data = _read(KN_DIR / "speed_limits.json") if (KN_DIR / "speed_limits.json").is_file() else {}
    te_data = _read(TE_DIR / "speed_limits.json") if (TE_DIR / "speed_limits.json").is_file() else {}
    out: dict[str, Any] = {}
    for region, d in speed_limits().items():
        hd = hi_data.get(region, {})
        roads = []
        for i, road in enumerate(d.get("roads", [])):
            label = list(road.get("t", []))
            hlabel = (hd.get("roads", [{}])[i].get("t") or []) if i < len(hd.get("roads", [])) else []
            roads.append({**road, "t": (label + [label[0]] * max(0, 3-len(label)))[:3] + [hlabel[3] if len(hlabel)>3 else label[0], (kn_data.get(region, {}).get("roads", [{}])[i].get("t") or [None])[0] if i < len(kn_data.get(region, {}).get("roads", [])) else label[0], (te_data.get(region, {}).get("roads", [{}])[i].get("t") or [None])[0] if i < len(te_data.get(region, {}).get("roads", [])) else label[0]]})
        vehicles = []
        for i, vehicle in enumerate(d.get("vehicles", [])):
            hv = hd.get("vehicles", [{}])[i] if i < len(hd.get("vehicles", [])) else {}
            row = dict(vehicle)
            for key in ("t", "sub"):
                label = list(vehicle.get(key, [])); hlabel = hv.get(key) or []
                row[key] = (label + [label[0]] * max(0, 3-len(label)))[:3] + [hlabel[3] if len(hlabel)>3 else label[0], (kn_data.get(region, {}).get("vehicles", [{}])[i].get(key) or [None])[0] if i < len(kn_data.get(region, {}).get("vehicles", [])) else label[0], (te_data.get(region, {}).get("vehicles", [{}])[i].get(key) or [None])[0] if i < len(te_data.get(region, {}).get("vehicles", [])) else label[0]]
            vehicles.append(row)
        out[region] = {**d, "roads": roads, "vehicles": vehicles,
                       "refs": [{"id": r, **refs[r].model_dump()} for r in d.get("refs", []) if r in refs]}
    return out


def scenarios_payload() -> list[Any]:
    libs = [_ml_library().get("scenarios", {}), _ta_library().get("scenarios", {}), _hi_library().get("scenarios", {}), _extra_library("kn").get("scenarios", {}), _extra_library("te").get("scenarios", {})]
    return [hexari(sc.model_dump(), *(lib.get(sc.id) for lib in libs), SCEN_SKIP) for sc in scenarios()]


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
def _search_docs() -> list[dict[str, str]]:  # noqa: C901 - flat list builder
    """Flattened documents for search and for instructor retrieval."""
    docs: list[dict[str, str]] = []
    for les, mod in lessons_by_id().values():
        body = " ".join(
            [les.intro, *les.objectives]
            + [" ".join([s.h, *s.p, *s.steps, s.note.text if s.note else ""]) for s in les.sections]
            + [" ".join(t) for t in les.terms] + les.mistakes + les.safety + les.examples
        )
        mll, tal, hil = ml_lesson(les.id), ta_lesson(les.id), hi_lesson(les.id)
        docs.append({"kind": "lesson", "id": les.id, "title": les.title, "title_ml": mll.get("title", ""),
                     "title_ta": tal.get("title", ""), "title_hi": hil.get("title", ""), "title_kn": _extra_lesson("kn", les.id).get("title", ""), "title_te": _extra_lesson("te", les.id).get("title", ""), "group": f"Module {mod.n}: {mod.title}",
                     "body": body, "body_ml": _flat_ml(mll), "body_ta": _flat_ml(tal), "body_hi": _flat_ml(hil), "body_kn": _flat_ml(_extra_lesson("kn", les.id)), "body_te": _flat_ml(_extra_lesson("te", les.id)),
                     "href": f"#lesson/{les.id}"})
    c = _content()
    for t in c.topics():
        a = c.article(t["id"])
        if not a:
            continue
        body = " ".join([a["intro"][0]] + [s["h"][0] + " " + " ".join(p[0] for p in s["p"]) for s in a["sections"]])
        body_ml = " ".join([a["intro"][1]] + [s["h"][1] + " " + " ".join(p[1] for p in s["p"]) for s in a["sections"]])
        body_ta = " ".join([a["intro"][2]] + [s["h"][2] + " " + " ".join(p[2] for p in s["p"]) for s in a["sections"]]) if len(a["intro"]) > 2 else ""
        body_hi = " ".join([a["intro"][3]] + [s["h"][3] + " " + " ".join(p[3] for p in s["p"]) for s in a["sections"]]) if len(a["intro"]) > 3 else ""
        body_kn = " ".join([a["intro"][4]] + [s["h"][4] + " " + " ".join(p[4] for p in s["p"]) for s in a["sections"]]) if len(a["intro"]) > 4 else ""
        body_te = " ".join([a["intro"][5]] + [s["h"][5] + " " + " ".join(p[5] for p in s["p"]) for s in a["sections"]]) if len(a["intro"]) > 5 else ""
        docs.append({"kind": "article", "id": t["id"], "title": t["name"][0], "title_ml": t["name"][1],
                     "title_ta": t["name"][2] if len(t["name"]) > 2 else "", "title_hi": t["name"][3] if len(t["name"]) > 3 else "", "title_kn": t["name"][4] if len(t["name"]) > 4 else "", "title_te": t["name"][5] if len(t["name"]) > 5 else "", "group": "Theory article",
                     "body": body, "body_ml": body_ml, "body_ta": body_ta, "body_hi": body_hi, "body_kn": body_kn, "body_te": body_te, "href": f"#theory/{t['id']}"})
    for d in c.signs():
        ml, ta = d.get("ml") or ["", "", ""], d.get("ta") or ["", "", ""]
        hi = d.get("hi") or ["", "", "", ""]
        kn = d.get("kn") or ["", "", "", "", ""]
        te = d.get("te") or ["", "", "", "", "", ""]
        docs.append({"kind": "sign", "id": d["id"], "title": d["name"], "title_ml": ml[0], "title_ta": ta[0], "title_hi": hi[0], "title_kn": kn[0], "title_te": te[0],
                     "group": "Road sign", "body": d["meaning"] + " " + d["action"],
                     "body_ml": ml[1] + " " + ml[2], "body_ta": ta[1] + " " + ta[2], "body_hi": hi[1] + " " + hi[2], "body_kn": kn[1] + " " + kn[2], "body_te": te[1] + " " + te[2], "href": f"#sign/{d['id']}"})
    for g in c.glossary():
        docs.append({"kind": "term", "id": g[0], "title": g[0], "title_ml": g[1], "title_ta": g[4] if len(g)>4 else "", "title_hi": g[6] if len(g)>6 else "", "title_kn": g[8] if len(g)>8 else "", "title_te": g[10] if len(g)>10 else "",
                     "group": "Glossary", "body": g[2], "body_ml": g[3], "body_ta": g[5] if len(g)>5 else "", "body_hi": g[7] if len(g)>7 else "", "body_kn": g[9] if len(g)>9 else "", "body_te": g[11] if len(g)>11 else "", "href": "#theory/gloss"})
    if speed_limits():
        def _speed_terms(lang: str) -> str:
            data = _read({"ml": ML_DIR, "ta": TA_DIR, "hi": HI_DIR, "kn": KN_DIR, "te": TE_DIR}[lang] / "speed_limits.json") if ({"ml": ML_DIR, "ta": TA_DIR, "hi": HI_DIR, "kn": KN_DIR, "te": TE_DIR}[lang] / "speed_limits.json").is_file() else {}
            idx = {"ta":2,"hi":3,"kn":0,"te":0}.get(lang,1)
            return " ".join(str(v) for region in data.values() for row in region.get("roads", []) + region.get("vehicles", []) for v in (row.get("t", [])[idx:idx+1] if len(row.get("t", [])) > idx else []))
        docs.append({"kind": "library", "id": "speed-limits", "title": "Speed limits in Kerala and India",
                     "title_ml": "കേരളത്തിലെയും ഇന്ത്യയിലെയും വേഗപരിധികൾ", "title_ta": "கேரளா மற்றும் இந்தியாவின் வேக வரம்புகள்",
                     "title_hi": "केरल और भारत में गति सीमाएँ", "title_kn": "ಕೇರಳ ಮತ್ತು ಭಾರತದ ವೇಗ ಮಿತಿಗಳು", "title_te": "కేరళ మరియు భారతదేశంలో వేగ పరిమితులు", "group": "Speed limits",
                     "body": "maximum speed limit km/h national highway state highway city expressway car two-wheeler bus lorry auto school bus",
                     "body_ml": "വേഗപരിധി പരമാവധി വേഗം ദേശീയപാത സംസ്ഥാന പാത നഗരം കാർ ഇരുചക്രവാഹനം ബസ് ലോറി ഓട്ടോ",
                     "body_ta": _speed_terms("ta"), "body_hi": _speed_terms("hi"), "body_kn": _speed_terms("kn"), "body_te": _speed_terms("te"), "href": "#limits"})
    lib, talib, hilib = _ml_library(), _ta_library(), _hi_library()
    knlib, telib = _extra_library("kn"), _extra_library("te")
    for w in warning_lights():
        mw, tw, hw, kw, tew = lib.get("lights", {}).get(w.id, {}), talib.get("lights", {}).get(w.id, {}), hilib.get("lights", {}).get(w.id, {}), knlib.get("lights", {}).get(w.id, {}), telib.get("lights", {}).get(w.id, {})
        docs.append({"kind": "light", "id": w.id, "title": w.name, "title_ml": mw.get("name", ""), "title_ta": tw.get("name", ""), "title_hi": hw.get("name", ""), "title_kn": kw.get("name", ""), "title_te": tew.get("name", ""), "group": "Warning light",
                     "body": " ".join([w.means, w.why, w.drive, *w.action, w.ignored]), "body_ml": _flat_ml(mw), "body_ta": _flat_ml(tw), "body_hi": _flat_ml(hw), "body_kn": _flat_ml(kw), "body_te": _flat_ml(tew),
                     "href": f"#vehicle/lights/{w.id}"})
    for p in vehicle_parts():
        mp, tp, hp, kp, tep = lib.get("parts", {}).get(p.id, {}), talib.get("parts", {}).get(p.id, {}), hilib.get("parts", {}).get(p.id, {}), knlib.get("parts", {}).get(p.id, {}), telib.get("parts", {}).get(p.id, {})
        docs.append({"kind": "part", "id": p.id, "title": p.name, "title_ml": mp.get("name", ""), "title_ta": tp.get("name", ""), "title_hi": hp.get("name", ""), "title_kn": kp.get("name", ""), "title_te": tep.get("name", ""), "group": "Vehicle part",
                     "body": " ".join([p.what, p.how, p.fails]), "body_ml": _flat_ml(mp), "body_ta": _flat_ml(tp), "body_hi": _flat_ml(hp), "body_kn": _flat_ml(kp), "body_te": _flat_ml(tep), "href": f"#vehicle/explore/{p.id}"})
    return docs


_STOP: frozenset[str] = frozenset(
    "a an and are as at be by can do does for from how i if in is it me my of on or should "
    "the this to what when where which who why will with you your".split()
)

_KIND_WEIGHT: dict[str, float] = {"lesson": 1.3, "light": 1.2, "part": 1.1, "article": 1.0, "sign": 0.9, "term": 0.8}
_GROUP_ML: dict[str, str] = {"Theory article": "തിയറി ലേഖനം", "Road sign": "റോഡ് ചിഹ്നം", "Glossary": "പദാവലി",
                             "Warning light": "മുന്നറിയിപ്പ് ലൈറ്റ്", "Vehicle part": "വാഹന ഭാഗം",
                             "Speed limits": "വേഗപരിധി"}
_GROUP_KN: dict[str, str] = {"Theory article": "ಸಿದ್ಧಾಂತ ಲೇಖನ", "Road sign": "ರಸ್ತೆ ಚಿಹ್ನೆ", "Glossary": "ಪದಕೋಶ", "Warning light": "ಎಚ್ಚರಿಕೆ ದೀಪ", "Vehicle part": "ವಾಹನದ ಭಾಗ", "Speed limits": "ವೇಗದ ಮಿತಿ"}
_GROUP_TE: dict[str, str] = {"Theory article": "సిద్ధాంత వ్యాసం", "Road sign": "రహదారి సంకేతం", "Glossary": "పదకోశం", "Warning light": "హెచ్చరిక లైట్", "Vehicle part": "వాహన భాగం", "Speed limits": "వేగ పరిమితులు"}
_GROUP_HI: dict[str, str] = {"Theory article": "सिद्धांत लेख", "Road sign": "सड़क संकेत", "Glossary": "शब्दावली", "Warning light": "चेतावनी लाइट", "Vehicle part": "वाहन का हिस्सा", "Speed limits": "गति सीमा"}
_GROUP_TA: dict[str, str] = {
    "Theory article": "கோட்பாட்டுக் கட்டுரை", "Road sign": "சாலை அடையாளம்",
    "Glossary": "சொற்களஞ்சியம்", "Warning light": "எச்சரிக்கை விளக்கு",
    "Vehicle part": "வாகனப் பகுதி", "Speed limits": "வேக வரம்புகள்",
}
_ML_CHARS = re.compile(r"[\u0d00-\u0d7f]")
_HI_CHARS = re.compile(r"[\u0900-\u097f]")
_KN_CHARS = re.compile(r"[\u0c80-\u0cff]")
_TE_CHARS = re.compile(r"[\u0c00-\u0c7f]")


def search(q: str, limit: int = 30) -> list[dict[str, Any]]:
    qn = _norm(q)
    if len(qn) < 2:
        return []
    words = [w for w in re.findall(r"[a-z0-9\u0900-\u097f\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0b80-\u0bff]+", qn) if len(w) > 1 and w not in _STOP]
    if not words:
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    is_hi = bool(_HI_CHARS.search(qn))
    is_kn = bool(_KN_CHARS.search(qn)); is_te = bool(_TE_CHARS.search(qn))
    is_ta = bool(re.search(r"[\u0b80-\u0bff]", qn))
    is_ml = bool(_ML_CHARS.search(qn))
    for d in _search_docs():
        title = (d.get("title_kn","") if is_kn else d.get("title_te","") if is_te else d.get("title_hi","") if is_hi else d.get("title_ta","") if is_ta else d.get("title_ml","") if is_ml else d["title"]).lower()
        body = (d.get("body_kn","") if is_kn else d.get("body_te","") if is_te else d.get("body_hi","") if is_hi else d.get("body_ta","") if is_ta else d.get("body_ml","") if is_ml else d["body"]).lower()
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
        grp_ta = _GROUP_TA.get(d["group"], "")
        if d["kind"] == "lesson":
            grp_ml = d["group"].replace("Module", "മൊഡ്യൂൾ")
            grp_ta = d["group"].replace("Module", "தொகுதி")
        scored.append((score, {
            "kind": d["kind"], "id": d["id"],
            "title": _pair(d["title"], d.get("title_ml") or None, d.get("title_ta") or None, d.get("title_hi") or None, d.get("title_kn") or None, d.get("title_te") or None),
            "group": _pair(d["group"], grp_ml or None, grp_ta or None, _GROUP_HI.get(d["group"], "") or None, _GROUP_KN.get(d["group"], "") or None, _GROUP_TE.get(d["group"], "") or None),
            "href": d["href"],
            "snippet": _snippet(d.get("body_kn","") if is_kn else d.get("body_te","") if is_te else d.get("body_hi","") if is_hi else d.get("body_ta","") if is_ta else d["body_ml"] if is_ml else d["body"], words[0] if words else qn),
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
            "title": d["title"], "title_ml": d.get("title_ml", ""), "title_ta": d.get("title_ta", ""), "title_hi": d.get("title_hi", ""), "title_kn": d.get("title_kn", ""), "title_te": d.get("title_te", ""),
            "group": d["group"], "group_ml": grp_ml, "group_ta": _GROUP_TA.get(d["group"], "பாடத் தொகுதி" if d["kind"] == "lesson" else ""), "group_hi": _GROUP_HI.get(d["group"], "पाठ" if d["kind"] == "lesson" else ""), "group_kn": _GROUP_KN.get(d["group"], "ಪಾಠ" if d["kind"] == "lesson" else ""), "group_te": _GROUP_TE.get(d["group"], "పాఠం" if d["kind"] == "lesson" else ""),
            "body": d["body"][:1500], "body_ml": d.get("body_ml", "")[:1500], "body_ta": d.get("body_ta", "")[:1500], "body_hi": d.get("body_hi", "")[:1500], "body_kn": d.get("body_kn", "")[:1500], "body_te": d.get("body_te", "")[:1500],
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
    for region, d in speed_limits().items():
        n = len(d.get("roads", []))
        for r_id in d.get("refs", []):
            if r_id not in refs:
                errs.append(f"speed limits {region}: unknown reference {r_id}")
        for v in d.get("vehicles", []):
            if len(v.get("lim", [])) != n:
                errs.append(f"speed limits {region}/{v.get('id')}: needs {n} limits")
            for lab in (v.get("t"), v.get("sub")):
                if not (isinstance(lab, list) and len(lab) in (2, 3) and all(isinstance(x, str) and x.strip() for x in lab)):
                    errs.append(f"speed limits {region}/{v.get('id')}: label needs [en, ml]")
        for rd in d.get("roads", []):
            t = rd.get("t")
            if not (isinstance(t, list) and len(t) in (2, 3) and all(isinstance(x, str) and x.strip() for x in t)):
                errs.append(f"speed limits {region}/{rd.get('id')}: road label needs [en, ml]")
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
