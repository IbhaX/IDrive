"""Question-set engine - ports the source app's signQ/prep/buildMock/
buildPractice logic to run server-side with a seeded RNG per paper."""

from __future__ import annotations

import random
from typing import Any, Optional

from app.services import content

SIGN_KINDS = ("name", "find", "cat", "desc")
MOCK_SIGN_QS = 12
MOCK_THEORY_QS = 18
MOCK_TOTAL = MOCK_SIGN_QS + MOCK_THEORY_QS
PRACTICE_SIGN_QS = 15
SECONDS_PER_QUESTION = 30
PASS_MARK = 18


def _sm(d: dict) -> list[str]:
    return d.get("ml") or []


def _m(d: dict, i: int) -> str:
    ml = _sm(d)
    return ml[i] if i < len(ml) else ""


def _t(d: dict, i: int) -> str:
    ta = d.get("ta") or []
    return ta[i] if i < len(ta) else ""


def _h(d: dict, i: int) -> str:
    hi = d.get("hi") or []
    return hi[i] if i < len(hi) else ""

def _k(d: dict, i: int) -> str:
    kn=d.get("kn") or []; return kn[i] if i<len(kn) else ""

def _te(d: dict, i: int) -> str:
    te=d.get("te") or []; return te[i] if i<len(te) else ""

def _triple(en: str, ml: str, ta: str, hi: str = "", kn: str = "", te: str = "") -> list[str]:
    return [en,ml or en,ta or en,hi or en,kn or en,te or en]


def _svg(d: dict) -> str:
    return content.sign_svgs().get(d["id"], "")


def _pick_options(d: dict, rng: random.Random, n: int = 3) -> list[dict]:
    """Same-category distractors first, then others - as in the source."""
    signs = content.signs()
    same = [x for x in signs if x["cat"] == d["cat"] and x["id"] != d["id"]]
    rest = [x for x in signs if x["cat"] != d["cat"]]
    rng.shuffle(same)
    rng.shuffle(rest)
    return (same + rest)[:n]


def sign_q(d: dict, rng: random.Random, kind: Optional[str] = None) -> dict:
    """Build one exam sign question (kinds: name, find, cat, desc)."""
    kind = kind or rng.choice(SIGN_KINDS)
    signs = content.signs()
    cats = content.categories()
    cat_by_id = content.cat_by_id()
    ui = content.ui()
    svg = _svg(d)
    reason = _triple(d["meaning"] + " " + d["action"], _m(d, 1) + " " + _m(d, 2), _t(d, 1) + " " + _t(d, 2), _h(d, 1) + " " + _h(d, 2), _k(d,1)+" "+_k(d,2), _te(d,1)+" "+_te(d,2))

    if kind == "name":
        opts = [d] + _pick_options(d, rng)
        rng.shuffle(opts)
        return {
            "id": "sg_n_" + d["id"], "t": "signs", "svg": svg,
            "q": _triple("What does this sign mean?", "ഈ ചിഹ്നം എന്താണ് അർത്ഥമാക്കുന്നത്?", "இந்தக் குறியீட்டின் பொருள் என்ன?", "इस संकेत का क्या अर्थ है?", "ಈ ಚಿಹ್ನೆಯ ಅರ್ಥವೇನು?", "ఈ గుర్తు అర్థం ఏమిటి?"),
            "o": [_triple(x["name"],_m(x,0),_t(x,0),_h(x,0),_k(x,0),_te(x,0)) for x in opts],
            "a": opts.index(d), "r": reason,
        }

    if kind == "find":
        opts = [d] + _pick_options(d, rng)
        rng.shuffle(opts)
        return {
            "id": "sg_f_" + d["id"], "t": "signs", "io": True,
            "q": [
                "Which of these is \u201c" + d["name"] + "\u201d?",
                "ഇവയിൽ \u201c" + (_m(d, 0) or d["name"]) + "\u201d ഏതാണ്?",
            ],
            "o": [
                {"svg":_svg(x),"n":_triple(x["name"],_m(x,0),_t(x,0),_h(x,0),_k(x,0),_te(x,0))}
                for x in opts
            ],
            "a": opts.index(d), "r": reason,
        }

    if kind == "cat":
        c = cat_by_id[d["cat"]]
        cm = c.get("ml") or []
        ct = c.get("ta") or []
        ch = c.get("hi") or []
        ck = c.get("kn") or []
        cte = c.get("te") or []
        others = [x for x in cats if x["id"] != d["cat"]]
        rng.shuffle(others)
        opts = [c] + others[:3]
        rng.shuffle(opts)
        return {
            "id": "sg_c_" + d["id"], "t": "signs", "svg": svg,
            "q": [
                "Which group does this sign belong to?",
                "ഈ ചിഹ്നം ഏത് വിഭാഗത്തിൽപ്പെടുന്നു?",
                "இந்தக் குறியீடு எந்த வகையைச் சேர்ந்தது?",
                "यह संकेत किस श्रेणी में आता है?",
                "ಈ ಚಿಹ್ನೆ ಯಾವ ಗುಂಪಿಗೆ ಸೇರಿದೆ?",
                "ఈ గుర్తు ఏ వర్గానికి చెందుతుంది?",
            ],
            "o": [
                _triple(x["name"], (x.get("ml") or [x["name"]])[0], (x.get("ta") or [x["name"]])[0], (x.get("hi") or [x["name"]])[0],(x.get("kn") or [x["name"]])[0],(x.get("te") or [x["name"]])[0])
                for x in opts
            ],
            "a": opts.index(c),
            "r": [
                f"{d['name']} is in the group \u201c{c['name']}\u201d. {c['blurb']}",
                f"{_m(d, 0) or d['name']} \u201c{cm[0] if len(cm) > 0 else ''}\u201d വിഭാഗത്തിൽ ഉൾപ്പെടുന്നു. {cm[1] if len(cm) > 1 else ''}",
                f"{_t(d, 0) or d['name']} “{ct[0] if len(ct) > 0 else ''}” வகையைச் சேர்ந்தது. {ct[1] if len(ct) > 1 else ''}",
                f"{_h(d,0) or d['name']} “{ch[0] if ch else ''}” श्रेणी में आता है। {ch[1] if len(ch)>1 else ''}",
                f"{_k(d,0) or d['name']} “{ck[0] if ck else ''}” ಗುಂಪಿಗೆ ಸೇರಿದೆ. {ck[1] if len(ck)>1 else ''}",
                f"{_te(d,0) or d['name']} “{cte[0] if cte else ''}” వర్గానికి చెందుతుంది. {cte[1] if len(cte)>1 else ''}",
            ],
        }

    # desc
    pool = [x for x in _pick_options(d, rng, n=8) if x["meaning"] != d["meaning"]]
    opts = [d] + pool[:3]
    rng.shuffle(opts)
    return {
        "id": "sg_d_" + d["id"], "t": "signs", "svg": svg,
        "q": [
            "Which statement describes this sign?",
            "ഈ ചിഹ്നത്തെ വിവരിക്കുന്ന പ്രസ്താവന ഏത്?",
            "இந்தக் குறியீட்டை விவரிக்கும் கூற்று எது?",
            "इस संकेत का वर्णन कौन सा कथन करता है?",
            "ಈ ಚಿಹ್ನೆಯನ್ನು ವಿವರಿಸುವ ಹೇಳಿಕೆ ಯಾವುದು?",
            "ఈ గుర్తును వివరించే ప్రకటన ఏది?",
        ],
        "o": [_triple(x["meaning"],_m(x,1),_t(x,1),_h(x,1),_k(x,1),_te(x,1)) for x in opts],
        "a": opts.index(d),
        "r": [
            d["name"] + ". " + d["action"],
            (_m(d, 0) or d["name"]) + ". " + _m(d, 2),
            (_t(d, 0) or d["name"]) + ". " + _t(d, 2),
            (_h(d,0) or d["name"])+". "+_h(d,2),
            (_k(d,0) or d["name"])+". "+_k(d,2),
            (_te(d,0) or d["name"])+". "+_te(d,2),
        ],
    }


def prep(q: dict, rng: random.Random) -> dict:
    """Shuffle a theory question's options and remap the answer index."""
    idx = list(range(len(q["o"])))
    rng.shuffle(idx)
    return {**q, "o": [q["o"][i] for i in idx], "a": idx.index(q["a"])}


def build_mock(rng: random.Random) -> list[dict]:
    """30 questions: 12 sign + 18 theory, fully shuffled."""
    signs = content.signs()
    qs = content.questions()
    sign_part = [sign_q(d, rng) for d in rng.sample(signs, MOCK_SIGN_QS)]
    theory_part = [prep(q, rng) for q in rng.sample(qs, MOCK_THEORY_QS)]
    out = sign_part + theory_part
    rng.shuffle(out)
    return out


def build_practice(topic: str, rng: random.Random) -> list[dict]:
    signs = content.signs()
    if topic == "signs":
        return [sign_q(d, rng) for d in rng.sample(signs, min(PRACTICE_SIGN_QS, len(signs)))]
    if topic.startswith("sg:"):
        cat = topic[3:]
        pool = [d for d in signs if d["cat"] == cat]
        return [sign_q(d, rng) for d in rng.sample(pool, min(PRACTICE_SIGN_QS, len(pool)))]
    return [prep(q, rng) for q in _shuffled(content.questions(), rng) if q["t"] == topic]


def _shuffled(xs: list, rng: random.Random) -> list:
    xs = list(xs)
    rng.shuffle(xs)
    return xs


def build_sign_quiz(cat: str, length: int, rng: random.Random) -> list[dict]:
    """The Learn-tab sign quiz: each item is s2n (sign→name) or n2s
    (name→sign) with 4 sign options. Answers included - instant feedback
    is the learning feature."""
    pool = content.signs_in_category(cat)
    rng.shuffle(pool)
    out = []
    for t in pool[: max(1, min(length, len(pool)))]:
        opts = [t] + _pick_options(t, rng)
        rng.shuffle(opts)
        a = opts.index(t)
        ui = content.ui()
        target = {**t, "svg": _svg(t)}
        if rng.random() < 0.5:  # s2n: show the sign, pick its name
            out.append({
                "id": t["id"], "t": "signs", "type": "s2n", "svg": _svg(t),
                "q": ui.get("qmean", ["What does this mean?", ""]),
                "o": [[x["name"], _m(x, 0) or x["name"]] for x in opts],
                "a": a, "target": target,
            })
        else:  # n2s: show the name, pick its sign
            mlname = _m(t, 0) or t["name"]
            out.append({
                "id": t["id"], "t": "signs", "type": "n2s", "io": True,
                "q": [
                    "Which sign is \u201c" + t["name"] + "\u201d?",
                    "\u201c" + mlname + "\u201d ഏത് ചിഹ്നമാണ്?",
                ],
                "o": [
                    {"svg":_svg(x),"n":_triple(x["name"],_m(x,0),_t(x,0),_h(x,0),_k(x,0),_te(x,0))}
                    for x in opts
                ],
                "a": a, "target": target,
            })
    return out


def strip_answers(qs: list[dict]) -> list[dict]:
    """Client copy of a mock paper - no answer keys, no reasoning."""
    return [
        {k: v for k, v in q.items() if k not in ("a", "r")}
        for q in qs
    ]


def score(paper_questions: list[dict], answers: list[Optional[int]]) -> dict:
    """Score a submission against a stored paper. Missing/extra answers are
    treated as unanswered."""
    review = []
    correct = 0
    for i, q in enumerate(paper_questions):
        picked = answers[i] if i < len(answers) else None
        ok = picked == q["a"]
        if ok:
            correct += 1
        review.append({
            "id": q["id"], "t": q["t"], "q": q["q"], "o": q["o"],
            "a": q["a"], "picked": picked, "correct": ok,
            "r": q.get("r"), "svg": q.get("svg"), "io": bool(q.get("io")),
        })
    return {"score": correct, "total": len(paper_questions), "review": review}
