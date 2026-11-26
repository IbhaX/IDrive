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

- **PWA:** `app/static/sw.js` is served at `/sw.js` with `__BUILD__` replaced by the build fingerprint (new worker per deploy). Shell = network first, `/static/*` = cache first (URLs are content-versioned), read-only content APIs = network first with offline fallback; auth/progress/exam/instructor are never cached. Install UI lives in `pwa.js` (native prompt on Chrome/Edge/Android, Share-sheet steps on iOS, File › Add to Dock on macOS Safari). Icons: `app/static/img/`, manifest: `app/static/manifest.webmanifest`.
- **Splash:** `#splash` in `index.html` (inline script: once per browser session, 8 s failsafe); `app.js` `hideSplash()` lifts it after the first route renders, after the ~1.55 s intro plus a 3 s hold. CSS keyframes under "startup splash"; reduced motion gets a short fade.
- **3D car:** `car3d.js` loads three.js r170 from jsDelivr through the import map in `index.html` (original, unminified addons — the minified `+esm` bundles break the Draco/KTX2 worker code; the map is allowed by a CSP sha256 hash computed in `pages.importmap_hashes`) and the Khronos "Car Concept" glTF (KTX2 + Draco, pinned commit) only when the student opts in; the choice is remembered (`idrive-3d`) and the service worker caches both (`idrive-3d-v1`). The CSP allows exactly those hosts plus `wasm-unsafe-eval` and `blob:` workers for the decoders. Orientation/axles are detected from the model's materials (Headlight, Tire*); tyres/brakes highlight real meshes, inner parts are simplified shapes shown in X-ray. The model is served same-origin from `/models/carconcept/*` (`services/model_mirror.py` downloads it into `data/models/` in the background at startup — size-checked, `MIRROR_3D=false` disables it, tests set that — and a file not yet copied is fetched by the server on demand — students never talk to GitHub; `/api/models/carconcept/status` lists anything missing), because raw.githubusercontent.com is slow or blocked on some Indian ISPs. Attribution (CC BY 4.0) is shown under the viewer; Khronos logo meshes are hidden. The viewer element is persistent — re-rendering the explorer re-attaches it, never reloads it. No inline scripts: the CSP forbids them (the splash logic is `splash.js`).
- **Logo:** the top-bar mark is the animated road-"i" (SMIL, so it runs on iOS); `app.js` pauses it under reduced motion. Static versions: `img/logo-mark.svg`, `img/icon.svg`, `img/favicon.svg`; animated: `img/logo-animated.svg`.

## Where things live

- Question engine port (`signQ`/`prep`/`buildMock`/`buildPractice`/`build_sign_quiz`): `app/services/exams.py`
- Progress blob service + versioned 409: `app/services/progress.py`
- Sessions (hashed tokens, expiry sweep at startup): `app/services/auth.py`
- Frontend event contract (`data-open`, `data-cat`, `data-etopic`, `data-ans`, `data-act`): `app/static/js/app.js` — mirrors the source app's delegation switch.
- Curriculum store, validation, search: `app/services/curriculum.py`; instructor retrieval + provider call: `app/services/instructor.py`
- New frontend modules: `course.js` (home, curriculum, lesson reader, knowledge checks, revision), `labs.js` (stopping, reaction, engine + lab router), `labs2.js` (following distance + gap drill, cornering friction circle, crash energy, headlight reach, mirrors & blind spots; controls use `data-act="lab.<name>"`), `vehicle.js`, `hazard.js`, `instructor.js`, `search.js`
- Bilingual helpers (`T`, `TP`, `BP`, `BPP`, `cn`, `topN`, `topDot`): `app/static/js/i18n.js`

## Testing notes

- `tests/conftest.py` builds each test a fresh SQLite file via `database_url` env var and clears the settings cache — keep env-dependent fixtures behind that pattern.
- Mock-score tests read the stored answer key from `exam_papers.payload` directly (`tests/helpers.py`) — real clients cannot do this; it exists only to verify scoring.
- `tests/test_data.py` is the extraction-drift guard: it fails if counts/fields deviate from the source (255/9/18/18/471/83).
