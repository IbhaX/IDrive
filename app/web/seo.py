"""Server-rendered, crawlable pages for every piece of iDrive content.

The app is a single-page app, but every screen also has a real URL
(`/sign/stop`, `/lesson/engine-basics`, `/theory/docs`, …). When such a URL
is requested, the server sends the normal app shell with the page's content
already written into `<main id="app">`, plus a unique title, description,
canonical link, English/Malayalam alternates, Open Graph tags and JSON-LD.
Crawlers that do not run JavaScript read that HTML; people get the app,
which takes over the same URL.

Rules kept here on purpose:
- Every page answers its question in the first paragraph under the heading.
- JSON-LD text is built from the same strings as the visible text.
- Unknown paths and unknown ids are real 404s (never an empty 200).
- `?lang=ml` renders the Malayalam version; it is the `hreflang="ml"` pair.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Optional

from app.config import BASE_DIR, get_settings
from app.services import content, curriculum

DATA_DIR = BASE_DIR / "app" / "data"
Lang = str  # "en" | "ml"


# ---------- small helpers ----------

def esc(s: Any) -> str:
    return html.escape(str(s), quote=True)


def pick(v: Any, lang: Lang) -> str:
    """One language from a value that may be a plain string or an [en, ml] pair."""
    if isinstance(v, (list, tuple)):
        if not v:
            return ""
        if lang == "ml" and len(v) > 1 and isinstance(v[1], str) and v[1].strip():
            return v[1]
        return str(v[0])
    return "" if v is None else str(v)


def ui(key: str, lang: Lang, **kw: Any) -> str:
    s = pick(content.ui().get(key, [key, key]), lang)
    for k, v in kw.items():
        s = s.replace("{" + k + "}", str(v))
    return s


def T(en: str, ml: str, lang: Lang) -> str:
    return ml if lang == "ml" else en


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "term"


def clip(s: str, n: int = 158) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= n:
        return s
    cut = s[: n - 1].rsplit(" ", 1)[0]
    return cut.rstrip(",;:—- ") + "…"


def site_url() -> str:
    return get_settings().site_url.rstrip("/")


def href(path: str, lang: Lang) -> str:
    return path + ("?lang=ml" if lang == "ml" else "")


def a(path: str, label: str, lang: Lang, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<a href="{esc(href(path, lang))}"{c}>{esc(label)}</a>'


# ---------- page model ----------

@dataclass
class Page:
    path: str
    title: str
    description: str
    body: str
    crumbs: list[tuple[str, str]] = field(default_factory=list)  # (label, path)
    jsonld: list[dict[str, Any]] = field(default_factory=list)
    indexable: bool = True
    og_type: str = "website"
    status: int = 200
    static: bool = False  # page has no app view (about/privacy/terms/install)


def faq(question: str, answer: str) -> dict[str, Any]:
    """FAQPage with one question — the answer string must be the visible one."""
    return {
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": {"@type": "Question", "name": question,
                       "acceptedAnswer": {"@type": "Answer", "text": answer}},
    }


def breadcrumb_ld(crumbs: list[tuple[str, str]], lang: Lang) -> dict[str, Any]:
    return {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": label, "item": site_url() + href(p, lang)}
            for i, (label, p) in enumerate(crumbs)
        ],
    }


def crumbs_html(crumbs: list[tuple[str, str]], lang: Lang) -> str:
    if len(crumbs) < 2:
        return ""
    parts = [a(p, label, lang) for label, p in crumbs[:-1]] + [f'<span aria-current="page">{esc(crumbs[-1][0])}</span>']
    return f'<nav class="crumbs" aria-label="Breadcrumb">{" / ".join(parts)}</nav>'


def home_crumb(lang: Lang) -> tuple[str, str]:
    return (ui("home", lang), "/")


def ul(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{x}</li>" for x in items) + "</ul>" if items else ""


# ---------- signs ----------

SIGN_WORD = {"mand", "caut", "info"}


def sign_name(d: dict[str, Any], lang: Lang) -> str:
    return (d.get("ml") or [d["name"]])[0] if lang == "ml" else d["name"]


def sign_text(d: dict[str, Any], lang: Lang) -> tuple[str, str]:
    ml = d.get("ml") or ["", "", ""]
    if lang == "ml" and ml[1]:
        return ml[1], ml[2]
    return d["meaning"], d["action"]


def sign_question(d: dict[str, Any], lang: Lang) -> str:
    n = sign_name(d, lang)
    if lang == "ml":
        return f"“{n}” ചിഹ്നം എന്താണ് അർത്ഥമാക്കുന്നത്?" if d["cat"] in SIGN_WORD else f"“{n}” എന്താണ് അർത്ഥമാക്കുന്നത്?"
    return f"What does the “{n}” sign mean?" if d["cat"] in SIGN_WORD else f"What does “{n}” mean?"


def sign_answer(d: dict[str, Any], lang: Lang) -> str:
    meaning, action = sign_text(d, lang)
    return f"{meaning} {T('What to do:', 'എന്ത് ചെയ്യണം:', lang)} {action}"


def cat_name(c: dict[str, Any], lang: Lang) -> str:
    return (c.get("ml") or [c["name"]])[0] if lang == "ml" else c["name"]


def cat_blurb(c: dict[str, Any], lang: Lang) -> str:
    ml = c.get("ml") or []
    return ml[1] if lang == "ml" and len(ml) > 1 else c.get("blurb", "")


@lru_cache(maxsize=1)
def _shared_sign_names() -> frozenset[str]:
    seen: dict[str, int] = {}
    for d in content.signs():
        seen[d["name"].lower()] = seen.get(d["name"].lower(), 0) + 1
    return frozenset(n for n, k in seen.items() if k > 1)


def page_sign(sid: str, lang: Lang) -> Optional[Page]:
    d = content.sign_by_id().get(sid)
    if not d:
        return None
    c = content.cat_by_id().get(d["cat"], {"id": d["cat"], "name": d["cat"]})
    name = sign_name(d, lang)
    q, ans = sign_question(d, lang), sign_answer(d, lang)
    meaning, action = sign_text(d, lang)
    svg = content.sign_svgs().get(sid, "")
    det = curriculum.sign_details_payload().get(sid)
    rich = ""
    if det:
        rich = (
            f'<h2>{esc(ui("sdAbout", lang))}</h2><p>{esc(pick(det["more"], lang))}</p>'
            f'<h2>{esc(ui("sdWhere", lang))}</h2>{ul([esc(pick(w, lang)) for w in det["where"]])}'
            f'<h2>{esc(ui("sdWhen", lang))}</h2>'
            + "".join(f'<h3>{esc(pick(w["s"], lang))}</h3><p>{esc(pick(w["d"], lang))}</p>' for w in det["when"])
            + f'<h2>{esc(ui("sdMistake", lang))}</h2><p>{esc(pick(det["mistake"], lang))}</p>'
        )
    same = [x for x in content.signs_in_category(d["cat"]) if x["id"] != sid][:8]
    more = ul([a(f"/sign/{x['id']}", sign_name(x, lang), lang) for x in same])
    crumbs = [home_crumb(lang), (ui("tSigns", lang), "/learn"), (cat_name(c, lang), f"/learn/{c['id']}"), (name, f"/sign/{sid}")]
    body = f"""<article class="panel seo">
{crumbs_html(crumbs, lang)}
<h1>{esc(q)}</h1>
<p class="answer"><strong>{esc(name)}</strong> — {esc(ans)}</p>
<figure class="plate seoplate" aria-hidden="true">{svg}</figure>
<dl class="facts"><dt>{esc(T('Category', 'വിഭാഗം', lang))}</dt><dd>{a(f"/learn/{c['id']}", cat_name(c, lang), lang)}</dd>
<dt>{esc(T('Meaning', 'അർത്ഥം', lang))}</dt><dd>{esc(meaning)}</dd>
<dt>{esc(ui("do", lang))}</dt><dd>{esc(action)}</dd></dl>
{rich}
<h2>{esc(T('More signs in this group', 'ഈ വിഭാഗത്തിലെ മറ്റ് ചിഹ്നങ്ങൾ', lang))}</h2>{more}
</article>"""
    # the visible answer paragraph is "<name> — <answer>"; the FAQ text matches it exactly
    visible = f"{name} — {ans}"
    shared = d["name"].lower() in _shared_sign_names()
    return Page(
        path=f"/sign/{sid}",
        title=f"{name}{' (' + cat_name(c, lang) + ')' if shared else ''} — {T('meaning and what to do', 'അർത്ഥവും ചെയ്യേണ്ടതും', lang)} | iDrive",
        description=clip(visible),
        body=body, crumbs=crumbs, og_type="article",
        jsonld=[faq(q, visible), breadcrumb_ld(crumbs, lang)],
    )


def page_learn(cat: Optional[str], lang: Lang) -> Optional[Page]:
    cats = content.categories()
    if cat and cat != "all":
        c = content.cat_by_id().get(cat)
        if not c:
            return None
        signs = content.signs_in_category(cat)
        crumbs = [home_crumb(lang), (ui("tSigns", lang), "/learn"), (cat_name(c, lang), f"/learn/{cat}")]
        items = [f'{a(f"/sign/{s["id"]}", sign_name(s, lang), lang)} — {esc(sign_text(s, lang)[0])}' for s in signs]
        h1 = T(f"{c['name']} — {len(signs)} signs explained", f"{cat_name(c, lang)} — {len(signs)} ചിഹ്നങ്ങൾ വിശദമായി", lang)
        body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1>
<p class="answer">{esc(cat_blurb(c, lang))}</p>{ul(items)}</article>"""
        return Page(path=f"/learn/{cat}", title=f"{h1} | iDrive", description=clip(cat_blurb(c, lang)),
                    body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
    total = len(content.signs())
    crumbs = [home_crumb(lang), (ui("tSigns", lang), "/learn")]
    h1 = T(f"Indian road signs: all {total} signs with meanings", f"ഇന്ത്യൻ റോഡ് ചിഹ്നങ്ങൾ: അർത്ഥത്തോടെ എല്ലാ {total} ചിഹ്നങ്ങളും", lang)
    lede = T(
        f"Every road sign, marking, signal, hand signal, dashboard light, vehicle control and number plate a learner in India needs — {total} in all, each with what it means and what to do, in English and Malayalam.",
        f"ഇന്ത്യയിലെ ഒരു പഠിതാവിന് വേണ്ട എല്ലാ റോഡ് ചിഹ്നങ്ങളും അടയാളങ്ങളും സിഗ്നലുകളും കൈ സൂചനകളും ഡാഷ്ബോർഡ് ലൈറ്റുകളും നിയന്ത്രണങ്ങളും നമ്പർ പ്ലേറ്റുകളും — ആകെ {total}, ഓരോന്നിന്റെയും അർത്ഥവും ചെയ്യേണ്ടതും ഇംഗ്ലീഷിലും മലയാളത്തിലും.", lang)
    secs = "".join(
        f'<h2>{a(f"/learn/{c["id"]}", cat_name(c, lang), lang)}</h2><p>{esc(cat_blurb(c, lang))}</p>'
        + ul([a(f"/sign/{s['id']}", sign_name(s, lang), lang) for s in content.signs_in_category(c["id"])])
        for c in cats)
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>
<p>{a("/limits", ui("tLimits", lang), lang)}</p>{secs}</article>"""
    return Page(path="/learn", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs,
                jsonld=[breadcrumb_ld(crumbs, lang)])


# ---------- theory & glossary ----------

def _pairs_ul(items: list[Any], lang: Lang) -> str:
    return ul([esc(pick(x, lang)) for x in items])


def page_theory(topic: Optional[str], lang: Lang) -> Optional[Page]:
    if not topic:
        crumbs = [home_crumb(lang), (ui("tTheory", lang), "/theory")]
        h1 = T("Driving theory for India: rules, documents and road skills", "ഇന്ത്യയിലെ ഡ്രൈവിങ് തിയറി: നിയമങ്ങൾ, രേഖകൾ, റോഡ് കഴിവുകൾ", lang)
        lede = T("Plain-language articles on the rules of the road, licences and documents, speed, junctions, night driving, emergencies and the licence test.",
                 "റോഡ് നിയമങ്ങൾ, ലൈസൻസും രേഖകളും, വേഗം, ജംഗ്ഷനുകൾ, രാത്രി ഡ്രൈവിങ്, അടിയന്തരാവസ്ഥകൾ, ലൈസൻസ് ടെസ്റ്റ് എന്നിവയെക്കുറിച്ച് ലളിതമായ ലേഖനങ്ങൾ.", lang)
        items = [a(f"/theory/{t['id']}", pick(t["name"], lang), lang) for t in content.topics()]
        items.append(a("/theory/gloss", T("Glossary of driving terms", "ഡ്രൈവിങ് പദാവലി", lang), lang))
        body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>{ul(items)}</article>'
        return Page(path="/theory", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs,
                    jsonld=[breadcrumb_ld(crumbs, lang)])
    if topic == "gloss":
        return page_glossary(None, lang)
    t = content.topic_by_id().get(topic)
    if not t:
        return None
    name = pick(t["name"], lang)
    crumbs = [home_crumb(lang), (ui("tTheory", lang), "/theory"), (name, f"/theory/{topic}")]
    art = content.article(topic)
    parts: list[str] = []
    intro = ""
    if art:
        intro = " ".join(pick(x, lang) for x in [art["intro"]]) if isinstance(art["intro"], list) and isinstance(art["intro"][0], str) else pick(art["intro"], lang)
        for s in art.get("sections", []):
            parts.append(f"<h2>{esc(pick(s.get('h'), lang))}</h2>" + "".join(f"<p>{esc(pick(p, lang))}</p>" for p in s.get("p", [])))
        if art.get("dos"):
            parts.append(f"<h2>{esc(T('Do', 'ചെയ്യുക', lang))}</h2>{_pairs_ul(art['dos'], lang)}")
        if art.get("donts"):
            parts.append(f"<h2>{esc(T('Don’t', 'ചെയ്യരുത്', lang))}</h2>{_pairs_ul(art['donts'], lang)}")
        if art.get("myths"):
            parts.append(f"<h2>{esc(T('Myths and facts', 'മിഥ്യകളും വസ്തുതകളും', lang))}</h2>"
                         + "".join(f"<h3>{esc(pick(m['m'], lang))}</h3><p>{esc(pick(m['f'], lang))}</p>" for m in art["myths"]))
        if art.get("stories"):
            parts.append(f"<h2>{esc(T('From the road (illustrative)', 'റോഡിൽ നിന്ന് (ഉദാഹരണം)', lang))}</h2>"
                         + "".join(f"<h3>{esc(pick(s['t'], lang))}</h3><p>{esc(pick(s['s'], lang))}</p>" for s in art["stories"]))
        if art.get("recap"):
            parts.append(f"<h2>{esc(T('Key points', 'പ്രധാന കാര്യങ്ങൾ', lang))}</h2>{_pairs_ul(art['recap'], lang)}")
    else:
        pts = [pick(x, lang) for x in t.get("lessons", [])]
        intro = pts[0] if pts else name
        parts.append(ul([esc(x) for x in pts[1:]]))
    body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(name)}</h1><p class="answer">{esc(intro)}</p>{"".join(parts)}</article>'
    return Page(path=f"/theory/{topic}", title=f"{name} — {T('driving theory', 'ഡ്രൈവിങ് തിയറി', lang)} | iDrive",
                description=clip(intro), body=body, crumbs=crumbs, og_type="article",
                jsonld=[{"@context": "https://schema.org", "@type": "Article", "headline": name, "description": clip(intro, 300),
                         "inLanguage": lang, "publisher": {"@type": "Organization", "name": "iDrive", "url": site_url()}},
                        breadcrumb_ld(crumbs, lang)])


@lru_cache(maxsize=1)
def glossary_slugs() -> dict[str, list[str]]:
    """slug -> glossary row. Fails loudly on a collision instead of shipping
    two URLs that share one canonical."""
    out: dict[str, list[str]] = {}
    for g in content.glossary():
        s = slugify(g[0])
        if s in out:
            raise RuntimeError(f"glossary slug collision: {g[0]!r} vs {out[s][0]!r} -> {s}")
        out[s] = g
    return out


def page_glossary(slug: Optional[str], lang: Lang) -> Optional[Page]:
    gl = glossary_slugs()
    if slug is None:
        crumbs = [home_crumb(lang), (ui("tTheory", lang), "/theory"), (T("Glossary", "പദാവലി", lang), "/theory/gloss")]
        h1 = T(f"Driving glossary: {len(gl)} terms in plain English and Malayalam", f"ഡ്രൈവിങ് പദാവലി: {len(gl)} പദങ്ങൾ ലളിതമായി", lang)
        rows = "".join(
            f'<dt id="{s}">{a(f"/glossary/{s}", g[1] if lang == "ml" else g[0], lang)}</dt><dd>{esc(g[3] if lang == "ml" else g[2])}</dd>'
            for s, g in gl.items())
        lede = T("Plain definitions of the driving words you meet in lessons and the licence test, in English and Malayalam.",
                 "പാഠങ്ങളിലും ലൈസൻസ് ടെസ്റ്റിലും കാണുന്ന ഡ്രൈവിങ് പദങ്ങളുടെ ലളിതമായ നിർവചനങ്ങൾ, ഇംഗ്ലീഷിലും മലയാളത്തിലും.", lang)
        body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p><dl class="gloss">{rows}</dl></article>'
        return Page(path="/theory/gloss", title=f"{h1} | iDrive",
                    description=clip(lede),
                    body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
    g = gl.get(slug)
    if not g:
        return None
    term, defin = (g[1], g[3]) if lang == "ml" else (g[0], g[2])
    q = T(f"What is {g[0]} in driving?", f"ഡ്രൈവിങ്ങിൽ {g[1]} എന്നാൽ എന്ത്?", lang)
    crumbs = [home_crumb(lang), (T("Glossary", "പദാവലി", lang), "/theory/gloss"), (term, f"/glossary/{slug}")]
    others = [s for s in gl if s != slug]
    i = list(gl).index(slug)
    near = [others[(i + k) % len(others)] for k in range(0, 6)] if others else []
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(q)}</h1>
<p class="answer"><strong>{esc(term)}</strong>: {esc(defin)}</p>
<p>{esc(T('In Malayalam:', 'ഇംഗ്ലീഷിൽ:', lang))} <span lang="{'en' if lang == 'ml' else 'ml'}">{esc(g[0] if lang == 'ml' else g[1])}</span></p>
<h2>{esc(T('More driving terms', 'മറ്റ് ഡ്രൈവിങ് പദങ്ങൾ', lang))}</h2>{ul([a(f"/glossary/{s}", gl[s][1] if lang == 'ml' else gl[s][0], lang) for s in near])}
<p>{a("/theory/gloss", T("All glossary terms", "എല്ലാ പദങ്ങളും", lang), lang)}</p></article>"""
    visible = f"{term}: {defin}"
    return Page(path=f"/glossary/{slug}", title=f"{term} — {T('meaning in driving', 'ഡ്രൈവിങ്ങിലെ അർത്ഥം', lang)} | iDrive",
                description=clip(visible), body=body, crumbs=crumbs, og_type="article",
                jsonld=[faq(q, visible),
                        {"@context": "https://schema.org", "@type": "DefinedTerm", "name": term, "description": defin,
                         "inDefinedTermSet": site_url() + "/theory/gloss"},
                        breadcrumb_ld(crumbs, lang)])


# ---------- course & lessons ----------

def page_course(lang: Lang) -> Page:
    cat = curriculum.catalogue()
    crumbs = [home_crumb(lang), (ui("tCourse", lang), "/course")]
    h1 = T("A complete driving course for India, from first lesson to licence test",
           "ആദ്യ പാഠം മുതൽ ലൈസൻസ് ടെസ്റ്റ് വരെ ഇന്ത്യയ്ക്കായുള്ള സമ്പൂർണ ഡ്രൈവിങ് കോഴ്സ്", lang)
    lede = T(f"{cat['counts']['modules']} modules and {cat['counts']['lessons']} lessons — vehicle science, road signs, traffic law, hazard perception, emergencies and the licence test — each with a short knowledge check.",
             f"{cat['counts']['modules']} മൊഡ്യൂളുകളും {cat['counts']['lessons']} പാഠങ്ങളും — വാഹന ശാസ്ത്രം, റോഡ് ചിഹ്നങ്ങൾ, ഗതാഗത നിയമം, അപകട തിരിച്ചറിവ്, അടിയന്തരാവസ്ഥകൾ, ലൈസൻസ് ടെസ്റ്റ് — ഓരോന്നിനും ഒരു ചെറിയ പരിശോധന.", lang)
    secs = []
    for m in cat["modules"]:
        items = []
        for ch in m["chapters"]:
            for it in ch["items"]:
                if it["type"] == "lesson":
                    items.append(a(f"/lesson/{it['id']}", pick(it["title"], lang), lang))
        secs.append(f'<h2 id="{esc(m["id"])}">{esc(T("Module", "മൊഡ്യൂൾ", lang))} {m["n"]}: {esc(pick(m["title"], lang))}</h2>'
                    f'<p>{esc(pick(m["summary"], lang))}</p>{ul(items)}')
    body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>{"".join(secs)}</article>'
    return Page(path="/course", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs,
                jsonld=[{"@context": "https://schema.org", "@type": "Course", "name": T("iDrive driving course", "iDrive ഡ്രൈവിങ് കോഴ്സ്", lang),
                         "description": lede, "inLanguage": lang, "isAccessibleForFree": True,
                         "provider": {"@type": "Organization", "name": "iDrive", "url": site_url()}},
                        breadcrumb_ld(crumbs, lang)])


def page_lesson(lid: str, lang: Lang) -> Optional[Page]:
    pl = curriculum.lesson_payload(lid)
    if not pl:
        return None
    L, mod = pl["lesson"], pl["module"]
    title = pick(L["title"], lang)
    crumbs = [home_crumb(lang), (ui("tCourse", lang), "/course"), (pick(mod["title"], lang), f"/course#{mod['id']}"), (title, f"/lesson/{lid}")]
    out = [f"<h2>{esc(T('What you will learn', 'ഈ പാഠത്തിൽ', lang))}</h2>{_pairs_ul(L['objectives'], lang)}"]
    for s in L["sections"]:
        sec = f"<h2>{esc(pick(s['h'], lang))}</h2>" + "".join(f"<p>{esc(pick(p, lang))}</p>" for p in s.get("p", []))
        if s.get("steps"):
            sec += "<ol>" + "".join(f"<li>{esc(pick(x, lang))}</li>" for x in s["steps"]) + "</ol>"
        if s.get("note"):
            sec += f'<aside class="note"><p>{esc(pick(s["note"]["text"], lang))}</p></aside>'
        out.append(sec)
    if L.get("terms"):
        out.append(f"<h2>{esc(T('Key terms', 'പ്രധാന പദങ്ങൾ', lang))}</h2><dl>"
                   + "".join(f"<dt>{esc(pick(t[0], lang))}</dt><dd>{esc(pick(t[1], lang))}</dd>" for t in L["terms"] if len(t) > 1) + "</dl>")
    for key, en, ml in (("examples", "Examples", "ഉദാഹരണങ്ങൾ"), ("mistakes", "Common mistakes", "സാധാരണ തെറ്റുകൾ"), ("safety", "Safety", "സുരക്ഷ")):
        if L.get(key):
            out.append(f"<h2>{esc(T(en, ml, lang))}</h2>{_pairs_ul(L[key], lang)}")
    if pl["references"]:
        out.append(f"<h2>{esc(T('Sources', 'ഉറവിടങ്ങൾ', lang))}</h2>" + ul(
            [f'<a href="{esc(r["url"])}" rel="noopener">{esc(r["title"])}</a> — {esc(r["publisher"])}' for r in pl["references"]]))
    nav = []
    if pl["prev"]:
        nav.append(a(f"/lesson/{pl['prev']}", "← " + T("Previous lesson", "മുമ്പത്തെ പാഠം", lang), lang))
    if pl["next"]:
        nav.append(a(f"/lesson/{pl['next']}", T("Next lesson", "അടുത്ത പാഠം", lang) + " →", lang))
    intro = pick(L["intro"], lang)
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(title)}</h1>
<p class="answer">{esc(intro)}</p>{"".join(out)}<p class="pn">{" · ".join(nav)}</p></article>"""
    raw = curriculum.lesson(lid)
    minutes = raw[0].minutes if raw else 10
    return Page(path=f"/lesson/{lid}", title=f"{title} | iDrive", description=clip(intro), body=body, crumbs=crumbs, og_type="article",
                jsonld=[{"@context": "https://schema.org", "@type": "LearningResource", "name": title, "description": clip(intro, 300),
                         "inLanguage": lang, "learningResourceType": "Lesson", "timeRequired": f"PT{minutes}M",
                         "educationalLevel": raw[0].level if raw else "", "isAccessibleForFree": True,
                         "isPartOf": {"@type": "Course", "name": pick(mod["title"], lang), "url": site_url() + href("/course", lang)}},
                        breadcrumb_ld(crumbs, lang)])


# ---------- hazards, vehicle, labs, limits ----------

def page_hazard(sid: Optional[str], lang: Lang) -> Optional[Page]:
    scen = curriculum.scenarios_payload()
    if not sid:
        crumbs = [home_crumb(lang), (ui("tHazard", lang), "/hazard")]
        h1 = T(f"Hazard perception practice: {len(scen)} road scenarios", f"അപകട തിരിച്ചറിവ് പരിശീലനം: {len(scen)} റോഡ് സാഹചര്യങ്ങൾ", lang)
        lede = T("Watch a short scene, spot the developing hazard, then choose the safest response. Covers pedestrians, two-wheelers, buses, junctions, highways, night, rain, fog and rural roads in India.",
                 "ഒരു ചെറിയ രംഗം കണ്ട്, രൂപപ്പെടുന്ന അപകടം കണ്ടെത്തി, ഏറ്റവും സുരക്ഷിതമായ പ്രതികരണം തിരഞ്ഞെടുക്കുക. കാൽനടക്കാർ, ഇരുചക്രവാഹനങ്ങൾ, ബസ്സുകൾ, ജംഗ്ഷനുകൾ, ഹൈവേ, രാത്രി, മഴ, മഞ്ഞ്, ഗ്രാമ റോഡുകൾ എന്നിവ ഉൾപ്പെടുന്നു.", lang)
        items = [f'{a(f"/hazard/{s["id"]}", pick(s["title"], lang), lang)} — {esc(pick(s["brief"], lang))}' for s in scen]
        body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>{ul(items)}</article>'
        return Page(path="/hazard", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
    s = next((x for x in scen if x["id"] == sid), None)
    if not s:
        return None
    title = pick(s["title"], lang)
    crumbs = [home_crumb(lang), (ui("tHazard", lang), "/hazard"), (title, f"/hazard/{sid}")]
    ok = next((c for c in s["choices"] if c.get("ok")), None)
    q = pick(s["question"], lang)
    answer = f"{pick(ok['t'], lang)} {pick(ok['why'], lang)}" if ok else ""
    wrong = [f"<strong>{esc(pick(c['t'], lang))}</strong> — {esc(pick(c['why'], lang))}" for c in s["choices"] if not c.get("ok")]
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(title)}</h1>
<p>{esc(pick(s['brief'], lang))}</p><h2>{esc(q)}</h2><p class="answer">{esc(answer)}</p>
<h3>{esc(T('Why the other choices are risky', 'മറ്റ് ഉത്തരങ്ങൾ അപകടകരമാകുന്നത് എന്തുകൊണ്ട്', lang))}</h3>{ul(wrong)}
<p>{a(f"/hazard/{sid}", T("Play this scenario", "ഈ സാഹചര്യം പരീക്ഷിക്കുക", lang), lang, "btn")}</p></article>"""
    return Page(path=f"/hazard/{sid}", title=f"{title} — {T('hazard perception', 'അപകട തിരിച്ചറിവ്', lang)} | iDrive",
                description=clip(f"{pick(s['brief'], lang)} {q}"), body=body, crumbs=crumbs, og_type="article",
                jsonld=[faq(f"{pick(s['brief'], lang)} {q}", answer), breadcrumb_ld(crumbs, lang)])


def page_vehicle(kind: Optional[str], item: Optional[str], lang: Lang) -> Optional[Page]:
    lights, parts = curriculum.lights_payload(), curriculum.parts_payload()
    vc = (ui("tVehicle", lang), "/vehicle")
    if kind is None:
        crumbs = [home_crumb(lang), vc]
        h1 = T("How a car works: parts, systems and warning lights", "കാർ എങ്ങനെ പ്രവർത്തിക്കുന്നു: ഭാഗങ്ങൾ, സംവിധാനങ്ങൾ, മുന്നറിയിപ്പ് ലൈറ്റുകൾ", lang)
        lede = T("Explore the main parts of a car — what each does, how it works and how it fails — and look up any dashboard warning light.",
                 "കാറിന്റെ പ്രധാന ഭാഗങ്ങൾ — ഓരോന്നും എന്ത് ചെയ്യുന്നു, എങ്ങനെ പ്രവർത്തിക്കുന്നു, എങ്ങനെ തകരാറിലാകുന്നു — പരിശോധിക്കുക; ഏത് ഡാഷ്ബോർഡ് ലൈറ്റും നോക്കുക.", lang)
        body = (f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>'
                f'<h2>{a("/vehicle/explore", T("Vehicle parts", "വാഹന ഭാഗങ്ങൾ", lang), lang)}</h2>'
                + ul([a(f"/vehicle/explore/{p['id']}", pick(p["name"], lang), lang) for p in parts])
                + f'<h2>{a("/vehicle/lights", T("Warning lights", "മുന്നറിയിപ്പ് ലൈറ്റുകൾ", lang), lang)}</h2>'
                + ul([a(f"/vehicle/lights/{w['id']}", pick(w["name"], lang), lang) for w in lights]) + "</article>")
        return Page(path="/vehicle", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
    if kind == "lights":
        lc = (T("Warning lights", "മുന്നറിയിപ്പ് ലൈറ്റുകൾ", lang), "/vehicle/lights")
        if item is None:
            crumbs = [home_crumb(lang), vc, lc]
            h1 = T("Car dashboard warning lights and what to do", "കാർ ഡാഷ്ബോർഡ് മുന്നറിയിപ്പ് ലൈറ്റുകളും ചെയ്യേണ്ടതും", lang)
            lede = T("Red means stop safely now, amber means get it checked soon, green and blue are information. Each light below explains what it means, whether you can keep driving and what to do.",
                     "ചുവപ്പ് എന്നാൽ ഇപ്പോൾ സുരക്ഷിതമായി നിർത്തുക, ആമ്പർ എന്നാൽ ഉടൻ പരിശോധിപ്പിക്കുക, പച്ചയും നീലയും വിവരം മാത്രം. ഓരോ ലൈറ്റിന്റെയും അർത്ഥവും തുടർന്ന് ഓടിക്കാമോ എന്നതും ചെയ്യേണ്ടതും താഴെ.", lang)
            body = (f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>'
                    + ul([f'{a(f"/vehicle/lights/{w["id"]}", pick(w["name"], lang), lang)} — {esc(pick(w["means"], lang))}' for w in lights]) + "</article>")
            return Page(path="/vehicle/lights", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
        w = next((x for x in lights if x["id"] == item), None)
        if not w:
            return None
        name = pick(w["name"], lang)
        crumbs = [home_crumb(lang), vc, lc, (name, f"/vehicle/lights/{item}")]
        q = T(f"What does the {w['name'][0] if isinstance(w['name'], list) else w['name']} light mean?", f"“{name}” ലൈറ്റ് എന്താണ് അർത്ഥമാക്കുന്നത്?", lang)
        ans = f"{pick(w['means'], lang)} {pick(w['drive'], lang)}"
        body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(q)}</h1><p class="answer">{esc(ans)}</p>
<h2>{esc(T('Why it matters', 'എന്തുകൊണ്ട് പ്രധാനം', lang))}</h2><p>{esc(pick(w['why'], lang))}</p>
<h2>{esc(T('What to do', 'എന്ത് ചെയ്യണം', lang))}</h2><ol>{"".join(f"<li>{esc(pick(x, lang))}</li>" for x in w['action'])}</ol>
<h2>{esc(T('Common causes', 'സാധാരണ കാരണങ്ങൾ', lang))}</h2>{_pairs_ul(w['causes'], lang)}
<h2>{esc(T('If you ignore it', 'അവഗണിച്ചാൽ', lang))}</h2><p>{esc(pick(w['ignored'], lang))}</p>
<h2>{esc(T('What a mechanic checks', 'മെക്കാനിക്ക് പരിശോധിക്കുന്നത്', lang))}</h2><p>{esc(pick(w['pro'], lang))}</p></article>"""
        return Page(path=f"/vehicle/lights/{item}", title=f"{name} — {T('warning light meaning', 'മുന്നറിയിപ്പ് ലൈറ്റിന്റെ അർത്ഥം', lang)} | iDrive",
                    description=clip(ans), body=body, crumbs=crumbs, og_type="article", jsonld=[faq(q, ans), breadcrumb_ld(crumbs, lang)])
    if kind == "explore":
        pc = (T("Vehicle parts", "വാഹന ഭാഗങ്ങൾ", lang), "/vehicle/explore")
        if item is None:
            crumbs = [home_crumb(lang), vc, pc]
            h1 = T("Parts of a car explained", "കാറിന്റെ ഭാഗങ്ങൾ വിശദമായി", lang)
            lede = T("What each major part of a car does, how it works, when you use it and how it fails.",
                     "കാറിന്റെ ഓരോ പ്രധാന ഭാഗവും എന്ത് ചെയ്യുന്നു, എങ്ങനെ പ്രവർത്തിക്കുന്നു, എപ്പോൾ ഉപയോഗിക്കുന്നു, എങ്ങനെ തകരാറിലാകുന്നു.", lang)
            body = (f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>'
                    + ul([f'{a(f"/vehicle/explore/{p["id"]}", pick(p["name"], lang), lang)} — {esc(pick(p["what"], lang))}' for p in parts]) + "</article>")
            return Page(path="/vehicle/explore", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
        p = next((x for x in parts if x["id"] == item), None)
        if not p:
            return None
        name = pick(p["name"], lang)
        crumbs = [home_crumb(lang), vc, pc, (name, f"/vehicle/explore/{item}")]
        q = T(f"What does the {p['name'][0] if isinstance(p['name'], list) else p['name']} do in a car?", f"കാറിൽ {name} എന്ത് ചെയ്യുന്നു?", lang)
        ans = pick(p["what"], lang)
        body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(q)}</h1><p class="answer">{esc(ans)}</p>
<h2>{esc(T('How it works', 'എങ്ങനെ പ്രവർത്തിക്കുന്നു', lang))}</h2><p>{esc(pick(p['how'], lang))}</p>
<h2>{esc(T('When it matters to you', 'നിങ്ങൾക്ക് എപ്പോൾ പ്രധാനം', lang))}</h2><p>{esc(pick(p['when'], lang))}</p>
<h2>{esc(T('How it fails', 'എങ്ങനെ തകരാറിലാകുന്നു', lang))}</h2><p>{esc(pick(p['fails'], lang))}</p></article>"""
        return Page(path=f"/vehicle/explore/{item}", title=f"{name} — {T('how it works', 'എങ്ങനെ പ്രവർത്തിക്കുന്നു', lang)} | iDrive",
                    description=clip(f"{ans} {pick(p['how'], lang)}"), body=body, crumbs=crumbs, og_type="article", jsonld=[faq(q, ans), breadcrumb_ld(crumbs, lang)])
    return None


def lab_ids() -> list[str]:
    return list(curriculum.LABS)


def page_science(lab: Optional[str], lang: Lang) -> Optional[Page]:
    sc = (ui("tScience", lang), "/science")
    if lab is None:
        crumbs = [home_crumb(lang), sc]
        h1 = T(f"Driving science labs: {len(lab_ids())} interactive experiments", f"ഡ്രൈവിങ് ശാസ്ത്ര ലാബുകൾ: {len(lab_ids())} സംവേദനാത്മക പരീക്ഷണങ്ങൾ", lang)
        lede = T("Move the sliders and see the physics behind safe driving: stopping distance, reaction time, grip in bends, crash energy, visibility, fuel use and more.",
                 "സ്ലൈഡറുകൾ നീക്കി സുരക്ഷിത ഡ്രൈവിങ്ങിന് പിന്നിലെ ഭൗതികശാസ്ത്രം കാണുക: നിർത്താനുള്ള ദൂരം, പ്രതികരണ സമയം, വളവിലെ ഗ്രിപ്പ്, ഇടിയുടെ ഊർജം, കാഴ്ച, ഇന്ധന ഉപയോഗം എന്നിവയും മറ്റും.", lang)
        items = [f'{a(f"/science/{k}", ui("lab_" + k, lang), lang)} — {esc(ui("labSub_" + k, lang))}' for k in lab_ids()]
        body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>{ul(items)}</article>'
        return Page(path="/science", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
    if lab not in curriculum.LABS:
        return None
    name, sub = ui("lab_" + lab, lang), ui("labSub_" + lab, lang)
    model = content.ui().get("m_" + lab)
    crumbs = [home_crumb(lang), sc, (name, f"/science/{lab}")]
    tip = content.ui().get({"speedbump": "sbHumpTip", "bendsight": "bsiTip"}.get(lab, ""))
    extra = ""
    if model:
        extra += f"<h2>{esc(T('How the model works', 'മാതൃക എങ്ങനെ പ്രവർത്തിക്കുന്നു', lang))}</h2><p>{esc(pick(model, lang))}</p>"
    if tip:
        extra += f"<h2>{esc(T('On the road', 'റോഡിൽ', lang))}</h2><p>{esc(pick(tip, lang))}</p>"
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(name)}</h1><p class="answer">{esc(sub)}.</p>{extra}
<p>{a(f"/science/{lab}", T("Open the interactive lab", "സംവേദനാത്മക ലാബ് തുറക്കുക", lang), lang, "btn")}</p></article>"""
    desc = f"{name}: {sub}. " + (pick(model, lang) if model else T(
        "An interactive iDrive lab: move the sliders and watch the numbers and the road picture change.",
        "ഒരു സംവേദനാത്മക iDrive ലാബ്: സ്ലൈഡറുകൾ നീക്കി സംഖ്യകളും റോഡ് ചിത്രവും മാറുന്നത് കാണുക.", lang))
    return Page(path=f"/science/{lab}", title=f"{name} — {T('interactive driving lab', 'സംവേദനാത്മക ഡ്രൈവിങ് ലാബ്', lang)} | iDrive",
                description=clip(desc), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])


# Games (static/js/games.js): ids in hub order, grouped like Gm.GROUPS there.
GAME_GROUPS: list[tuple[str, list[str]]] = [
    ("gmReact", ["brakelight", "greenlight", "kidout", "gonogo", "indicator", "mirrors", "peripheral", "stopline", "dodge",
                 "lanekeep", "speedkeep", "gapjudge", "animals", "fogspot", "nightped"]),
    ("gmLogic", ["parking", "route", "rightofway", "roundabout", "sequence", "fuelplan", "stopguess", "gapcount", "speedmath",
                 "plates", "blindspots", "overtake"]),
    ("gmRules", ["signsprint", "signpairs", "oddsign", "dashlights"]),
]
GAME_IDS: list[str] = [g for _, ids in GAME_GROUPS for g in ids]


def page_games(gid: Optional[str], lang: Lang) -> Optional[Page]:
    gc = (ui("tGames", lang), "/games")
    if gid is None:
        crumbs = [home_crumb(lang), gc]
        h1 = T(f"Driving games: {len(GAME_IDS)} games for reaction time and road logic",
               f"ഡ്രൈവിങ് ഗെയിമുകൾ: പ്രതികരണ സമയത്തിനും റോഡ് യുക്തിക്കും {len(GAME_IDS)} ഗെയിമുകൾ", lang)
        lede = ui("gmLede", lang)
        parts = []
        for gk, ids in GAME_GROUPS:
            parts.append(f"<h2>{esc(ui(gk, lang))}</h2>" + ul([f'{a(f"/games/{k}", ui("gm_" + k, lang), lang)} — {esc(ui("gmSub_" + k, lang))}' for k in ids]))
        body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>{"".join(parts)}</article>'
        return Page(path="/games", title=f"{h1} | iDrive", description=clip(lede), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])
    if gid not in GAME_IDS:
        return None
    name, sub, how = ui("gm_" + gid, lang), ui("gmSub_" + gid, lang), ui("gmHow_" + gid, lang)
    crumbs = [home_crumb(lang), gc, (name, f"/games/{gid}")]
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(name)}</h1><p class="answer">{esc(sub)}. {esc(how)}</p>
<p>{a(f"/games/{gid}", T("Play the game", "ഗെയിം കളിക്കുക", lang), lang, "btn")}</p></article>"""
    return Page(path=f"/games/{gid}", title=f"{name} — {T('driving game', 'ഡ്രൈവിങ് ഗെയിം', lang)} | iDrive",
                description=clip(f"{name}: {sub}. {how}"), body=body, crumbs=crumbs, jsonld=[breadcrumb_ld(crumbs, lang)])


def page_limits(lang: Lang) -> Optional[Page]:
    data = curriculum.speed_limits_payload()
    if not data:
        return None
    crumbs = [home_crumb(lang), (ui("tLimits", lang), "/limits")]
    kl = data["kerala"]
    road = {r["id"]: i for i, r in enumerate(kl["roads"])}
    car = next(v for v in kl["vehicles"] if v["id"] == "m1")
    q = T("What is the speed limit for cars in Kerala?", "കേരളത്തിൽ കാറുകളുടെ വേഗപരിധി എത്ര?", lang)
    ans = T(
        f"In Kerala the maximum for cars, jeeps and taxis is {car['lim'][road['nh4']]} km/h on four-lane and six-lane national highways, "
        f"{car['lim'][road['nh']]} km/h on other national highways and four-lane state highways, {car['lim'][road['sh']]} km/h on other state highways and major district roads, "
        f"{car['lim'][road['other']]} km/h on other roads and {car['lim'][road['city']]} km/h within city limits. A lower posted sign always applies.",
        f"കേരളത്തിൽ കാർ, ജീപ്പ്, ടാക്സി എന്നിവയ്ക്ക് പരമാവധി നാലുവരി, ആറുവരി ദേശീയപാതകളിൽ {car['lim'][road['nh4']]} km/h, മറ്റ് ദേശീയപാതകളിലും നാലുവരി സംസ്ഥാന പാതകളിലും {car['lim'][road['nh']]} km/h, "
        f"മറ്റ് സംസ്ഥാന പാതകളിലും പ്രധാന ജില്ലാ റോഡുകളിലും {car['lim'][road['sh']]} km/h, മറ്റ് റോഡുകളിൽ {car['lim'][road['other']]} km/h, നഗര പരിധിക്കുള്ളിൽ {car['lim'][road['city']]} km/h. കുറഞ്ഞ പരിധി സ്ഥാപിച്ചിട്ടുണ്ടെങ്കിൽ അതാണ് ബാധകം.", lang)
    tables = []
    for key, head in (("kerala", ui("spKerala", lang)), ("india", ui("spIndia", lang))):
        R = data[key]
        th = "".join(f'<th scope="col">{esc(pick(r["t"], lang))}</th>' for r in R["roads"])
        rows = "".join(
            f'<tr><th scope="row">{esc(pick(v["t"], lang))}<br><small>{esc(pick(v["sub"], lang))}</small></th>'
            + "".join(f"<td>{'—' if x is None else x}</td>" for x in v["lim"]) + "</tr>" for v in R["vehicles"])
        refs = ul([f'<a href="{esc(r["url"])}" rel="noopener">{esc(r["title"])}</a> — {esc(r["publisher"])}, {esc(ui("spVerified", lang, d=r["verified"]))}' for r in R["refs"]])
        tables.append(f'<h2>{esc(head)} (km/h)</h2><div class="sptable"><table><thead><tr><th scope="col">{esc(ui("spVehicle", lang))}</th>{th}</tr></thead><tbody>{rows}</tbody></table></div>{refs}')
    notes = ul([esc(ui(k, lang)) for k in ("spN1", "spN2", "spN3k", "spN3i", "spN4", "spN5")])
    body = f"""<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(ui("spTitle", lang))}</h1>
<h2>{esc(q)}</h2><p class="answer">{esc(ans)}</p>{"".join(tables)}<h2>{esc(ui("spNotes", lang))}</h2>{notes}</article>"""
    return Page(path="/limits", title=f"{T('Speed limits in Kerala and India by vehicle and road', 'കേരളത്തിലെയും ഇന്ത്യയിലെയും വേഗപരിധി — വാഹനവും റോഡും അനുസരിച്ച്', lang)} | iDrive",
                description=clip(ans), body=body, crumbs=crumbs, jsonld=[faq(q, ans), breadcrumb_ld(crumbs, lang)])


def page_tool(view: str, lang: Lang) -> Page:
    """App screens that need the interactive app (tests, quiz, cards, AI
    instructor, progress). Mock tests and practice are worth indexing;
    personal screens are not."""
    counts = content.question_counts()
    nq = sum(counts.values())
    info = {
        "exam": (T("Free learner licence mock test and practice questions", "സൗജന്യ ലേണേഴ്സ് ലൈസൻസ് മോക്ക് ടെസ്റ്റും പരിശീലന ചോദ്യങ്ങളും", lang),
                 T(f"Take a timed mock test in the style of the learner licence test, or practise topic by topic from {nq} questions with explanations, in English and Malayalam. Sign in to save results and sync across devices.",
                   f"ലേണേഴ്സ് ലൈസൻസ് ടെസ്റ്റിന്റെ രീതിയിൽ സമയബന്ധിതമായ മോക്ക് ടെസ്റ്റ് എഴുതുക, അല്ലെങ്കിൽ വിശദീകരണങ്ങളോടെ {nq} ചോദ്യങ്ങളിൽ നിന്ന് വിഷയം തിരിച്ച് പരിശീലിക്കുക — ഇംഗ്ലീഷിലും മലയാളത്തിലും. ഫലങ്ങൾ സൂക്ഷിക്കാനും ഉപകരണങ്ങളിൽ സമന്വയിപ്പിക്കാനും സൈൻ ഇൻ ചെയ്യുക.", lang), True),
        "quiz": (T("Road sign quiz", "റോഡ് ചിഹ്ന ക്വിസ്", lang),
                 T(f"Test yourself on {len(content.signs())} Indian road signs, markings and signals.", f"{len(content.signs())} ഇന്ത്യൻ റോഡ് ചിഹ്നങ്ങളിലും അടയാളങ്ങളിലും സിഗ്നലുകളിലും സ്വയം പരിശോധിക്കുക.", lang), True),
        "cards": (T("Road sign flashcards", "റോഡ് ചിഹ്ന ഫ്ലാഷ്കാർഡുകൾ", lang),
                  T("Flip through sign flashcards with spaced repetition until every sign sticks.", "ഓരോ ചിഹ്നവും ഓർമയിൽ ഉറയ്ക്കുന്നതുവരെ ഇടവിട്ടുള്ള ആവർത്തനത്തോടെ ഫ്ലാഷ്കാർഡുകൾ മറിക്കുക.", lang), True),
        "ask": (T("Ask the driving instructor", "ഡ്രൈവിങ് ഇൻസ്ട്രക്ടറോട് ചോദിക്കുക", lang),
                T("Ask a driving-theory question and get an answer grounded in iDrive's lessons.", "ഒരു ഡ്രൈവിങ് തിയറി ചോദ്യം ചോദിച്ച് iDrive പാഠങ്ങളെ ആധാരമാക്കിയ ഉത്തരം നേടുക.", lang), False),
        "progress": (T("Your progress", "നിങ്ങളുടെ പുരോഗതി", lang),
                     T("Your lessons, scores and streaks.", "നിങ്ങളുടെ പാഠങ്ങളും സ്കോറുകളും തുടർച്ചയും.", lang), False),
    }[view]
    crumbs = [home_crumb(lang), (info[0], f"/{view}")]
    body = f'<article class="panel seo">{crumbs_html(crumbs, lang)}<h1>{esc(info[0])}</h1><p class="answer">{esc(info[1])}</p></article>'
    return Page(path=f"/{view}", title=f"{info[0]} | iDrive", description=clip(info[1]), body=body, crumbs=crumbs,
                indexable=info[2], jsonld=[breadcrumb_ld(crumbs, lang)])


# ---------- home ----------

def org_ld() -> list[dict[str, Any]]:
    s = get_settings()
    same = [u for u in (s.play_store_url,) if u]
    org: dict[str, Any] = {"@context": "https://schema.org", "@type": "Organization", "name": "iDrive",
                           "url": site_url(), "logo": site_url() + "/static/img/icon-512.png"}
    if same:
        org["sameAs"] = same
    app = {"@context": "https://schema.org", "@type": "WebApplication", "name": "iDrive — the interactive driving school",
           "url": site_url(), "applicationCategory": "EducationalApplication", "operatingSystem": "Any (web, Android, iOS, desktop)",
           "inLanguage": ["en", "ml"], "isAccessibleForFree": True,
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"}}
    site = {"@context": "https://schema.org", "@type": "WebSite", "name": "iDrive", "url": site_url(), "inLanguage": ["en", "ml"]}
    return [org, site, app]


def page_home(lang: Lang) -> Page:
    cat = curriculum.catalogue()
    n = {"signs": len(content.signs()), "q": sum(content.question_counts().values()), "lessons": cat["counts"]["lessons"],
         "scen": cat["counts"]["scenarios"], "gloss": len(content.glossary()), "labs": len(lab_ids())}
    h1 = T("iDrive — learn to drive in India, properly explained", "iDrive — ഇന്ത്യയിൽ ഡ്രൈവിങ് പഠിക്കാം, ശരിയായി വിശദീകരിച്ച്", lang)
    lede = T(f"A free, interactive driving-theory school for India and Kerala: {n['lessons']} lessons, {n['signs']} road signs, {n['q']} practice questions, {n['scen']} hazard scenarios, {n['labs']} science labs and a learner licence mock test — every explanation in English and Malayalam.",
             f"ഇന്ത്യയ്ക്കും കേരളത്തിനുമുള്ള സൗജന്യ, സംവേദനാത്മക ഡ്രൈവിങ് തിയറി സ്കൂൾ: {n['lessons']} പാഠങ്ങൾ, {n['signs']} റോഡ് ചിഹ്നങ്ങൾ, {n['q']} പരിശീലന ചോദ്യങ്ങൾ, {n['scen']} അപകട സാഹചര്യങ്ങൾ, {n['labs']} ശാസ്ത്ര ലാബുകൾ, ലേണേഴ്സ് ലൈസൻസ് മോക്ക് ടെസ്റ്റ് — എല്ലാ വിശദീകരണവും ഇംഗ്ലീഷിലും മലയാളത്തിലും.", lang)
    sec = [
        ("/course", ui("tCourse", lang), T("Structured lessons from vehicle basics to the licence test.", "വാഹന അടിസ്ഥാനങ്ങൾ മുതൽ ലൈസൻസ് ടെസ്റ്റ് വരെ ക്രമീകരിച്ച പാഠങ്ങൾ.", lang)),
        ("/learn", ui("tSigns", lang), T(f"All {n['signs']} signs, markings and signals with meanings.", f"അർത്ഥത്തോടെ എല്ലാ {n['signs']} ചിഹ്നങ്ങളും അടയാളങ്ങളും സിഗ്നലുകളും.", lang)),
        ("/limits", ui("tLimits", lang), ui("spLinkSub", lang)),
        ("/theory", ui("tTheory", lang), T("Articles on rules, documents and road skills.", "നിയമങ്ങൾ, രേഖകൾ, റോഡ് കഴിവുകൾ എന്നിവയെക്കുറിച്ചുള്ള ലേഖനങ്ങൾ.", lang)),
        ("/theory/gloss", T("Glossary", "പദാവലി", lang), T(f"{n['gloss']} driving terms defined.", f"{n['gloss']} ഡ്രൈവിങ് പദങ്ങളുടെ നിർവചനം.", lang)),
        ("/hazard", ui("tHazard", lang), T(f"{n['scen']} hazard perception scenarios.", f"{n['scen']} അപകട തിരിച്ചറിവ് സാഹചര്യങ്ങൾ.", lang)),
        ("/science", ui("tScience", lang), T(f"{n['labs']} interactive physics labs.", f"{n['labs']} സംവേദനാത്മക ഭൗതികശാസ്ത്ര ലാബുകൾ.", lang)),
        ("/games", ui("tGames", lang), T(f"{len(GAME_IDS)} driving games for reaction time and road logic.", f"പ്രതികരണ സമയത്തിനും റോഡ് യുക്തിക്കും {len(GAME_IDS)} ഡ്രൈവിങ് ഗെയിമുകൾ.", lang)),
        ("/vehicle", ui("tVehicle", lang), T("Car parts and dashboard warning lights.", "കാർ ഭാഗങ്ങളും ഡാഷ്ബോർഡ് മുന്നറിയിപ്പ് ലൈറ്റുകളും.", lang)),
        ("/exam", ui("tTests", lang), T("Learner licence mock test and practice.", "ലേണേഴ്സ് ലൈസൻസ് മോക്ക് ടെസ്റ്റും പരിശീലനവും.", lang)),
        ("/about", T("About iDrive", "iDrive-നെക്കുറിച്ച്", lang), T("Who makes iDrive and what it is — and is not.", "iDrive ആരാണ് നിർമിക്കുന്നത്, അത് എന്താണ് — എന്തല്ല.", lang)),
    ]
    cats = ul([a(f"/learn/{c['id']}", cat_name(c, lang), lang) for c in content.categories()])
    body = f"""<article class="panel seo"><h1>{esc(h1)}</h1><p class="answer">{esc(lede)}</p>
{ul([f"{a(p, l, lang)} — {esc(d)}" for p, l, d in sec])}
<h2>{esc(T('Road sign groups', 'റോഡ് ചിഹ്ന വിഭാഗങ്ങൾ', lang))}</h2>{cats}</article>"""
    return Page(path="/", title=T("iDrive — the interactive driving school for India and Kerala", "iDrive — ഇന്ത്യയ്ക്കും കേരളത്തിനുമുള്ള സംവേദനാത്മക ഡ്രൈവിങ് സ്കൂൾ", lang),
                description=clip(lede), body=body, crumbs=[home_crumb(lang)], jsonld=org_ld())


# ---------- static trust pages ----------

def page_static(name: str, lang: Lang) -> Optional[Page]:
    from app.web import trust
    got = trust.render(name, lang)
    if not got:
        return None
    title, desc, body = got
    crumbs = [home_crumb(lang), (title, f"/{name}")]
    return Page(path=f"/{name}", title=f"{title} | iDrive", description=clip(desc),
                body=f'<article class="panel seo prose">{crumbs_html(crumbs, lang)}{body}</article>',
                crumbs=crumbs, static=True, jsonld=[breadcrumb_ld(crumbs, lang)])


STATIC_PAGES = ("about", "privacy", "terms", "install")


# ---------- resolver ----------

def resolve(path: str, lang: Lang) -> Optional[Page]:
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts or parts == ["home"]:
        return page_home(lang)
    head, rest = parts[0], parts[1:]
    one = rest[0] if rest else None
    if len(rest) > 2:
        return None
    if head == "sign" and len(rest) == 1:
        return page_sign(rest[0], lang)
    if head == "learn" and len(rest) <= 1:
        return page_learn(one, lang)
    if head == "theory" and len(rest) <= 1:
        return page_theory(one, lang)
    if head == "glossary" and len(rest) == 1:
        return page_glossary(rest[0], lang)
    if head == "course" and not rest:
        return page_course(lang)
    if head == "lesson" and len(rest) == 1:
        return page_lesson(rest[0], lang)
    if head == "hazard" and len(rest) <= 1:
        return page_hazard(one, lang)
    if head == "vehicle":
        if not rest:
            return page_vehicle(None, None, lang)
        if rest[0] in ("lights", "explore"):
            return page_vehicle(rest[0], rest[1] if len(rest) > 1 else None, lang)
        return None
    if head == "science" and len(rest) <= 1:
        return page_science(one, lang)
    if head == "games" and len(rest) <= 1:
        return page_games(one, lang)
    if head == "limits" and not rest:
        return page_limits(lang)
    if head in ("exam", "quiz", "cards", "ask", "progress") and not rest:
        return page_tool(head, lang)
    if head in STATIC_PAGES and not rest:
        return page_static(head, lang)
    return None


def not_found(lang: Lang) -> Page:
    h1 = T("Page not found", "പേജ് കണ്ടെത്തിയില്ല", lang)
    body = (f'<article class="panel seo"><h1>{esc(h1)}</h1><p>{esc(T("That address does not exist on iDrive.", "ആ വിലാസം iDrive-ൽ ഇല്ല.", lang))}</p>'
            f'<p>{a("/", T("Go to the home page", "ഹോം പേജിലേക്ക് പോകുക", lang), lang, "btn")}</p></article>')
    return Page(path="/404", title=f"{h1} | iDrive", description=h1, body=body, indexable=False, status=404, static=True)


# ---------- head + shell injection ----------

_TITLE = re.compile(r"<title>.*?</title>", re.S)
_DESC = re.compile(r'<meta name="description" content="[^"]*">')
_OGT = re.compile(r'<meta property="og:title" content="[^"]*">')
_OGD = re.compile(r'<meta property="og:description" content="[^"]*">')
_APP = re.compile(r'(<main class="wrap" id="app" tabindex="-1">)(</main>)')


def head_tags(page: Page, lang: Lang) -> str:
    base = site_url()
    canon = base + href(page.path, lang)
    tags = [f'<link rel="canonical" href="{esc(canon)}">']
    if page.indexable and page.status == 200:
        tags += [
            f'<link rel="alternate" hreflang="en" href="{esc(base + page.path)}">',
            f'<link rel="alternate" hreflang="ml" href="{esc(base + href(page.path, "ml"))}">',
            f'<link rel="alternate" hreflang="x-default" href="{esc(base + page.path)}">',
        ]
    else:
        tags.append('<meta name="robots" content="noindex">')
    tags += [
        f'<meta property="og:url" content="{esc(canon)}">',
        f'<meta property="og:locale" content="{"ml_IN" if lang == "ml" else "en_IN"}">',
        f'<meta property="og:locale:alternate" content="{"en_IN" if lang == "ml" else "ml_IN"}">',
        f'<meta name="twitter:url" content="{esc(canon)}">',
        f'<meta name="twitter:title" content="{esc(page.title)}">',
        f'<meta name="twitter:description" content="{esc(page.description)}">',
    ]
    if page.static:
        tags.append('<meta name="app-static" content="1">')
    if page.status == 404:
        tags.append('<meta name="app-notfound" content="1">')
    s = get_settings()
    if s.ga_measurement_id:
        tags.append(f'<meta name="ga-id" content="{esc(s.ga_measurement_id)}">')
    if s.ads_id:
        tags.append(f'<meta name="ads-id" content="{esc(s.ads_id)}">')
    if s.ads_signup_label:
        tags.append(f'<meta name="ads-signup" content="{esc(s.ads_signup_label)}">')
    if s.play_store_url:
        tags.append(f'<meta name="play-url" content="{esc(s.play_store_url)}">')
    for ld in page.jsonld:
        # JSON-LD is data, not script: escape "<" so text can never close the tag
        tags.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("<", "\\u003c") + "</script>")
    return "\n".join(tags)


def inject(markup: str, page: Page, lang: Lang) -> str:
    markup = markup.replace("<html>", f'<html lang="{lang}">', 1)
    markup = _TITLE.sub(lambda _: f"<title>{esc(page.title)}</title>", markup, 1)
    markup = _DESC.sub(lambda _: f'<meta name="description" content="{esc(page.description)}">', markup, 1)
    markup = _OGT.sub(lambda _: f'<meta property="og:title" content="{esc(page.title)}">', markup, 1)
    markup = _OGD.sub(lambda _: f'<meta property="og:description" content="{esc(page.description)}">', markup, 1)
    if page.og_type != "website":
        markup = markup.replace('<meta property="og:type" content="website">', f'<meta property="og:type" content="{page.og_type}">', 1)
    markup = markup.replace("</head>", head_tags(page, lang) + "\n</head>", 1)
    markup = _APP.sub(lambda m: m.group(1) + page.body + m.group(2), markup, 1)
    return markup


# ---------- sitemap ----------

def _mtime_date(paths: list[Path]) -> str:
    ts = 0.0
    for p in paths:
        if p.is_file():
            ts = max(ts, p.stat().st_mtime)
        elif p.is_dir():
            for f in p.rglob("*.json"):
                ts = max(ts, f.stat().st_mtime)
    if not ts:
        return date.today().isoformat()
    return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()


CUR = DATA_DIR / "curriculum"
SITEMAPS: dict[str, tuple[Callable[[], list[str]], list[Path]]] = {
    "static": (lambda: ["/", "/learn", "/course", "/theory", "/hazard", "/science", "/games", "/vehicle", "/vehicle/lights",
                        "/vehicle/explore", "/limits", "/exam", "/quiz", "/cards", "/about", "/privacy", "/terms", "/install"],
               [DATA_DIR / "ui_extra.json", BASE_DIR / "app" / "web" / "trust.py"]),
    "signs": (lambda: [f"/sign/{s['id']}" for s in content.signs()], [DATA_DIR / "signs.json", CUR / "sign_details.json", CUR / "ml" / "sign_details.json"]),
    "categories": (lambda: [f"/learn/{c['id']}" for c in content.categories()], [DATA_DIR / "categories.json", DATA_DIR / "signs.json"]),
    "theory": (lambda: [f"/theory/{t['id']}" for t in content.topics()] + ["/theory/gloss"], [DATA_DIR / "topics.json", DATA_DIR / "articles"]),
    "glossary": (lambda: [f"/glossary/{s}" for s in glossary_slugs()], [DATA_DIR / "glossary.json"]),
    "lessons": (lambda: [f"/lesson/{lid}" for lid in curriculum.catalogue()["lessonOrder"]], [CUR / "modules", CUR / "ml"]),
    "scenarios": (lambda: [f"/hazard/{s.id}" for s in curriculum.scenarios()], [CUR / "scenarios.json", CUR / "ml" / "library.json"]),
    "lights": (lambda: [f"/vehicle/lights/{w.id}" for w in curriculum.warning_lights()], [CUR / "warning_lights.json", CUR / "ml" / "library.json"]),
    "parts": (lambda: [f"/vehicle/explore/{p.id}" for p in curriculum.vehicle_parts()], [CUR / "vehicle_parts.json", CUR / "ml" / "library.json"]),
    "labs": (lambda: [f"/science/{k}" for k in lab_ids()], [DATA_DIR / "ui_extra.json"]),
    "games": (lambda: [f"/games/{k}" for k in GAME_IDS], [DATA_DIR / "ui_extra.json", BASE_DIR / "app" / "static" / "js" / "games.js"]),
}


def sitemap_index() -> str:
    base = site_url()
    rows = "".join(f"<sitemap><loc>{base}/sitemaps/{name}.xml</loc><lastmod>{_mtime_date(src)}</lastmod></sitemap>"
                   for name, (_, src) in SITEMAPS.items())
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</sitemapindex>\n'


def sitemap(name: str) -> Optional[str]:
    got = SITEMAPS.get(name)
    if not got:
        return None
    paths, src = got
    base, lm = site_url(), _mtime_date(src)
    out = []
    for p in paths():
        for lang in ("en", "ml"):
            alts = (f'<xhtml:link rel="alternate" hreflang="en" href="{esc(base + p)}"/>'
                    f'<xhtml:link rel="alternate" hreflang="ml" href="{esc(base + href(p, "ml"))}"/>'
                    f'<xhtml:link rel="alternate" hreflang="x-default" href="{esc(base + p)}"/>')
            out.append(f"<url><loc>{esc(base + href(p, lang))}</loc><lastmod>{lm}</lastmod>{alts}</url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml">' + "".join(out) + "</urlset>\n")


def all_paths() -> list[str]:
    return [p for fn, _ in SITEMAPS.values() for p in fn()]


# ---------- robots / llms ----------

def robots_txt() -> str:
    base = site_url()
    retrieval = ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
                 "Googlebot", "Bingbot", "GoogleOther", "Applebot", "DuckDuckBot", "Meta-ExternalFetcher"]
    trainers = ["GPTBot", "ClaudeBot", "anthropic-ai", "Claude-Web", "Google-Extended", "Applebot-Extended", "CCBot",
                "Bytespider", "cohere-ai", "cohere-training-data-crawler", "Meta-ExternalAgent", "meta-externalagent",
                "Amazonbot", "MistralAI-Training", "PanguBot", "Timpibot", "ImagesiftBot", "omgili", "Diffbot"]
    scrapers = ["AhrefsBot", "SemrushBot", "SemrushBot-SWA", "BLEXBot", "DotBot", "MJ12bot", "PetalBot"]
    lines = ["# iDrive — robots.txt",
             "# Search and AI answer engines may read and cite iDrive; model training is declined.",
             "", "User-agent: *", "Content-Signal: search=yes, ai-input=yes, ai-train=no",
             "Allow: /", "Disallow: /api/", "Allow: /api/curriculum", "Allow: /api/library/", "Allow: /api/content/", ""]
    lines += ["# AI search and answer engines (they cite and link back)"]
    for b in retrieval:
        lines += [f"User-agent: {b}", "Allow: /", "Disallow: /api/", ""]
    lines += ["# Model-training crawlers: declined"]
    for b in trainers:
        lines += [f"User-agent: {b}", "Disallow: /", ""]
    lines += ["# SEO scrapers"]
    for b in scrapers:
        lines += [f"User-agent: {b}", "Disallow: /", ""]
    lines += [f"Sitemap: {base}/sitemap.xml", ""]
    return "\n".join(lines)


def llms_txt() -> str:
    base = site_url()
    cat = curriculum.catalogue()
    n_signs, n_q = len(content.signs()), sum(content.question_counts().values())
    s = get_settings()
    lines = [
        "# iDrive — the interactive driving school", "",
        f"> iDrive is a free, interactive driving-theory app for India and Kerala. It teaches road signs, traffic law, "
        f"hazard perception and vehicle science, with every explanation in English and Malayalam: {n_signs} road signs, "
        f"{n_q} practice questions, {cat['counts']['lessons']} lessons, {cat['counts']['scenarios']} hazard scenarios, "
        f"{len(content.glossary())} glossary terms and {len(lab_ids())} interactive labs. iDrive is an independent study tool; "
        f"it is not affiliated with any government, RTO or Motor Vehicles Department.", "",
        "Every page is also available in Malayalam by adding ?lang=ml to its URL.", "",
        "## Core content",
        f"- [Road signs]({base}/learn): all {n_signs} signs, markings, signals, dashboard lights and plates with meaning and the action each requires.",
        f"- [Speed limits]({base}/limits): Kerala and all-India maximum speeds by vehicle and road type, with the notifications they come from.",
        f"- [Driving course]({base}/course): {cat['counts']['modules']} modules and {cat['counts']['lessons']} lessons.",
        f"- [Driving theory]({base}/theory): articles on rules, documents, junctions, night driving, emergencies and the licence test.",
        f"- [Glossary]({base}/theory/gloss): {len(content.glossary())} driving terms.",
        f"- [Warning lights]({base}/vehicle/lights): what each dashboard light means and what to do.",
        f"- [Vehicle parts]({base}/vehicle/explore): what each part does and how it fails.", "",
        "## Interactive practice",
        f"- [Mock test and practice]({base}/exam): learner licence-style mock test and topic practice.",
        f"- [Hazard scenarios]({base}/hazard): {cat['counts']['scenarios']} interactive situations.",
        f"- [Science labs]({base}/science): stopping distance, reaction time, grip and more.",
        f"- [Driving games]({base}/games): {len(GAME_IDS)} games for reaction time, attention and road logic.", "",
        "## About",
        f"- [About iDrive]({base}/about)", f"- [Privacy]({base}/privacy)", f"- [Terms]({base}/terms)",
    ]
    if s.play_store_url:
        lines.append(f"- [Android app]({s.play_store_url})")
    lines += ["", "## Optional", f"- [Full text]({base}/llms-full.txt): all signs, glossary terms and lessons as plain text.",
              f"- [Sitemap]({base}/sitemap.xml)", ""]
    return "\n".join(lines)


def llms_full_txt() -> str:
    base = site_url()
    out = ["# iDrive — full text (English)", "", f"Source: {base}. Malayalam versions: add ?lang=ml to any page URL.", ""]
    out.append("## Road signs")
    for d in content.signs():
        out.append(f"### {d['name']} ({base}/sign/{d['id']})\n{d['meaning']} What to do: {d['action']}")
    out += ["", "## Glossary"]
    for slug, g in glossary_slugs().items():
        out.append(f"- **{g[0]}** ({base}/glossary/{slug}): {g[2]}")
    out += ["", "## Lessons"]
    for lid in curriculum.catalogue()["lessonOrder"]:
        hit = curriculum.lesson(lid)
        if not hit:
            continue
        L = hit[0]
        out.append(f"### {L.title} ({base}/lesson/{lid})\n{L.intro}")
        for sct in L.sections:
            out.append(f"#### {sct.h}\n" + "\n".join(sct.p) + ("\n" + "\n".join(f"- {x}" for x in sct.steps) if sct.steps else ""))
    out.append("")
    return "\n".join(out)


def shell_for_tests() -> str:
    """The unprocessed index.html (tests inject pages into it without the app)."""
    return (BASE_DIR / "app" / "static" / "index.html").read_text(encoding="utf-8")
