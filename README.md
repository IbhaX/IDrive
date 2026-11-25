# iDrive

The interactive driving-theory school for India, with extra depth for Kerala — fully bilingual in English and Malayalam (every lesson, quiz, warning light, vehicle part and scenario, not just the interface).

- **Curriculum:** 12 modules from absolute beginner to advanced (driving basics, how vehicles work, dashboard lights, signs, traffic law, practical manoeuvres, defensive driving, maintenance, emergencies, vehicle dynamics, psychology, licensing) — 38 authored lessons with objectives, worked examples, safety notes, knowledge checks and cited, date-verified sources, plus the 18 original theory articles.
- **Interactive:** clickable vehicle explorer, 17-entry warning-light encyclopedia (stop-now vs check-soon), stopping-distance lab, reaction-time test, animated four-stroke engine, six hazard-perception scenarios.
- **Practice:** 255-sign library and quiz, 471 MCQs, server-scored timed mock exams, flashcards, a spaced revision queue built from missed lesson questions.
- **AI instructor:** answers grounded in iDrive's own content with numbered citations; search-only fallback when no provider is configured.
- **Dashboard:** curriculum progress, levels (Beginner → Theory mastery, based on completed checks, mocks and scenarios — not time), streak, readiness, strongest/weakest modules, bookmarks, milestones.

iDrive is a FastAPI app with a vanilla-JS, no-build frontend animated with vendored GSAP (ScrollTrigger, Flip, DrawSVG). See `docs/AUDIT.md` for the audit and roadmap.

## Quick start

```bash
pip install -e .                     # installs the `idrive` command
idrive                               # → http://localhost:5000
# dev alternatives: pip install -r requirements-dev.txt && uvicorn app.main:app --reload
# flags: idrive --host 0.0.0.0 --port 8000 --reload
```

Run checks:

```bash
python -m pytest -q     # or: make test   — unit/API/data + curriculum linter
python tools/smoke.py   # or: make smoke  — end-to-end happy path
python -m compileall -q app tests tools  # or: make lint
```

Visual + interaction check across desktop/tablet/mobile and dark/light (server running):

```bash
pip install playwright && playwright install chromium
python tools/visual_check.py --base http://localhost:5000 --out shots
```

Re-extract content after editing `Sadak Saathi.html`:

```bash
node tools/extract_data.mjs   # or: make extract — rewrites app/data/*.json
```

## Architecture

```
app/
  main.py        FastAPI app: lifespan, security headers, rate limits, SPA mount
  config.py      pydantic-settings (env-var driven)
  db.py          async SQLAlchemy, SQLite in WAL mode
  models.py      User, Session, UserProgress, ExamPaper, ExamAttempt
  schemas.py     request/response DTOs
  security.py    pbkdf2 password hashing, hashed session tokens
  api/           auth / content / quiz / exam / progress routers
  services/      content store, exam engine, progress store, auth
  data/          extracted JSON datasets (generated — do not hand-edit)
  data/curriculum/  authored curriculum: modules/*.json, references, warning
                 lights, vehicle parts, hazard scenarios (hand-edited, linted)
  static/        index.html + css + vanilla-JS modules (no build step)
  web/pages.py   versioned static serving + shell rendering
tools/           extract_data.mjs (source → JSON), smoke.py
tests/           pytest suite (unit, API contract, data integrity)
```

### Data flow

Learning content is extracted from `Sadak Saathi.html` by `tools/extract_data.mjs`, which evaluates the source script in a Node VM and serialises its data tables (255 signs, 9 categories, 18 topics + articles, 471 MCQs, 83 glossary terms) into `app/data/*.json`. The frontend boots from `/api/content/index` (text only) and lazily fetches sign SVGs, articles and the glossary.

### Curriculum

`app/data/curriculum/` is the hand-authored source of truth for lessons. Each `modules/mNN-*.json` file holds a module, its chapters (ordered items such as `lesson:id`, `article:speed`, `lab:stopping`, `scenario:animal`, `signs:caut`, `practice:docs`, `exam:mock`) and its lessons. `app/services/curriculum.py` validates everything with pydantic at startup, and `tests/test_curriculum.py` runs the content linter: unresolved items, bad answer indices, legal notes without references, references without verification dates, and **any money amount** fail the build. Endpoints: `GET /api/curriculum`, `/api/curriculum/lessons/{id}`, `/api/curriculum/search?q=`, `/api/library/{lights,vehicle,scenarios,references}`.

### AI instructor

`POST /api/instructor/ask` retrieves the best passages from lessons, articles, lights, parts, signs and the glossary, then (for signed-in users, when `OPENROUTER_API_KEY` is set) asks an OpenAI-compatible model to answer **only from those numbered sources**, with citations, no fine amounts, no invented section numbers and no unsafe instructions. Guests, keyless deployments and provider errors get `mode: "search"` — the sourced passages themselves.

### Accounts and progress

Registering creates a bearer session (30 days). Progress (`seen`, Leitner `box`, `wrong`, quiz/exam stats) is a JSON blob synced via `GET/PUT /api/progress` with optimistic-concurrency versioning — a stale write returns 409 + the server blob, and the client re-merges (union/max rules in `static/js/auth.js`). Guests can browse the sign library and read theory articles; every test feature — sign quiz, flashcards, topic practice, mock exams — requires an account, as does synced progress.

### Mock exams

`POST /api/exam/mock` (auth required) builds the 30-question paper server-side (12 sign + 18 theory questions, 30 s per question, pass at 18) and stores the answer key in `exam_papers`. The client never receives `a`/`r` fields. `POST /api/exam/{id}/submit` scores against the stored key, flags late submissions past the server deadline, and is idempotent. Practice sets (`/api/exam/practice`) and the sign quiz (`/api/quiz/signs`) ship answers by design — instant feedback is the learning feature.

## Configuration

All settings are env vars (see `.env.example`). The important ones:

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | sqlite+aiosqlite:///data/idrive.db | any async SQLAlchemy URL |
| `SECRET_PEPPER` | change-me-in-production | **required in production** — app refuses to boot otherwise |
| `ENVIRONMENT` | development | `production` enforces the pepper check |
| `RATE_LIMIT_DEFAULT` / `RATE_LIMIT_AUTH` | 300/min, 20/min | slowapi format |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | empty / `openai/gpt-4o-mini` | AI instructor via OpenRouter, set in the root `.env`; empty key = search-only mode. `AI_*` names are accepted too. |
| `GOOGLE_CLIENT_ID` | empty | enables the Google sign-in button + `POST /api/auth/google`; ID tokens are verified server-side via Google's tokeninfo. Add your origins to the OAuth client's **Authorized JavaScript origins** in Google Cloud Console. `GOOGLE_CLIENT_SECRET` is unused by this flow. |

## Docker

```bash
docker build -t idrive .
docker run -p 8000:8000 \
  -e SECRET_PEPPER=$(openssl rand -hex 32) \
  -v idrive-data:/app/data idrive
```

The image runs as a non-root user; `/app/data` (SQLite) is a volume.

## Content safety

Road-rule content carries disclaimers ("rules change — confirm with MV Act / RTO / Parivahan"), stories are labelled illustrative, and no fine amounts are included. See `content_review.md` for the unverified-facts register — required reading before a public launch.
