# Contributor notes (AGENTS.md)

## Commands

| Task | Command |
| --- | --- |
| Install (runtime + dev) | `pip install -r requirements-dev.txt` |
| Run dev server | `idrive` (after `pip install -e .`) or `uvicorn app.main:app --reload` (or `make dev`) |
| Tests | `python -m pytest -q` (or `make test`) |
| Smoke check | `python tools/smoke.py` (or `make smoke`) |
| Re-extract content | `node tools/extract_data.mjs` (or `make extract`) |
| Lint/compile check | `python -m compileall -q app tests tools` |
| Visual check | `python tools/visual_check.py --base http://localhost:5000` (needs Playwright + Chromium) |

Python 3.12+, Node 18+ (extraction only). Windows-friendly: no shell-isms outside the Makefile.

## Conventions that matter

- **Typing is mandatory.** Every function has parameter and return types; collections are parameterised (`dict[str, Any]`), `Optional[T]` is explicit. Run the AST audit in `tests` context or `mypy`-style review before committing.
- **Layers:** `api/` (HTTP) → `services/` (application) → `models`/data stores. Routes never hold business logic; services never see `Request`/`Response`.
- **`app/data/*.json` is generated** by `tools/extract_data.mjs` — never hand-edit (except `ui_extra.json`, which is intentionally static and merged into the UI table server-side). After editing `Sadak Saathi.html`, run `make extract`; `meta.json` content version changes → clients refresh.
- **Frontend is vanilla JS modules, no build step.** Views render markup that mirrors the source app's classes (`panel`, `opts`, `signopts`, `rv`, `crow`, `mrow`, …) — do not rename classes without checking `app.css`. All UI strings come from `Data.UI` (ui.json + ui_extra.json) — no hard-coded copy in JS.
- **GSAP is vendored** in `static/vendor/gsap/`. Views call `Motion.*` helpers only; every animation must have a `prefers-reduced-motion` fallback and animate transforms/opacity only.
- **The exam answer key never leaves the server.** Mock papers are stored in `exam_papers`; the client gets stripped questions (`exams.strip_answers`). Keep it that way.
- **Progress merge rules** (client, `auth.js`): `seen` union; `box`/`wrong` per-key max; `best`/`played`/`mock` field-wise max; `tq` per-topic max; `lang` local wins. `PUT` carries the base version; 409 → re-merge + retry once.
- **Curriculum content** lives in `app/data/curriculum/` and *is* hand-edited (unlike the generated `app/data/*.json`). After editing, run `python -m pytest -q tests/test_curriculum.py` — the linter must stay clean. Legal statements need a `law` note **and** a reference id with a `verified` date; never add money amounts.
- **Malayalam curriculum** lives in `app/data/curriculum/ml/<module id>.json` (+ `library.json` for lights, parts, scenarios) and mirrors the English structure field by field. The API zips them into `[en, ml]` pairs; views render any content value with `I18n.X` (HTML) or `I18n.one` (plain text for attributes/crumbs). When you add or change English text, update the Malayalam mirror — `test_malayalam_translation_is_complete` fails otherwise.
- **Views and routes:** hash routes are `#view/param/param2` (`app.js` → `parseHash`). Add a view by registering it in `VIEWS`, adding it to `TABS` if it needs a tab, and adding the path to the SPA list in `main.py`. New UI copy goes into `ui_extra.json` as `[en, ml]`.
- **Animation scope:** call `Motion.scoped(fn)` for any timeline/ScrollTrigger a view creates; `render()` calls `Motion.resetView()` so nothing leaks between routes. Scroll reveals use the `.rvl` class (`.rv` belongs to the exam review list).
- **Progress blob additions** (`les`, `bm`, `rec`, `days`, `rq`, `hz`, `lab`, `secs`) merge as: `les` field-wise max; `bm` latest `|ts|` wins (sign = on/off); `days` union; `hz`/`rq` per-key max; `lab.rt` min; `rec` local order first; `secs` max.
- **Content safety:** no fine amounts in data; stories carry the illustrative label (a data field); the RTO/Parivahan disclaimer stays in the footer + articles. Track unverified facts in `content_review.md`.

## Where things live

- Question engine port (`signQ`/`prep`/`buildMock`/`buildPractice`/`build_sign_quiz`): `app/services/exams.py`
- Progress blob service + versioned 409: `app/services/progress.py`
- Sessions (hashed tokens, expiry sweep at startup): `app/services/auth.py`
- Frontend event contract (`data-open`, `data-cat`, `data-etopic`, `data-ans`, `data-act`): `app/static/js/app.js` — mirrors the source app's delegation switch.
- Curriculum store, validation, search: `app/services/curriculum.py`; instructor retrieval + provider call: `app/services/instructor.py`
- New frontend modules: `course.js` (home, curriculum, lesson reader, knowledge checks, revision), `labs.js`, `vehicle.js`, `hazard.js`, `instructor.js`, `search.js`
- Bilingual helpers (`T`, `TP`, `BP`, `BPP`, `cn`, `topN`, `topDot`): `app/static/js/i18n.js`

## Testing notes

- `tests/conftest.py` builds each test a fresh SQLite file via `database_url` env var and clears the settings cache — keep env-dependent fixtures behind that pattern.
- Mock-score tests read the stored answer key from `exam_papers.payload` directly (`tests/helpers.py`) — real clients cannot do this; it exists only to verify scoring.
- `tests/test_data.py` is the extraction-drift guard: it fails if counts/fields deviate from the source (255/9/18/18/471/83).
