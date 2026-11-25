# IDrive

Learn Indian road signs, markings, signals, hand signals and driving theory — bilingual in English and Malayalam. IDrive is a FastAPI port of the single-file **Sadak Saathi** app, following the FreeLLMChat project layout, with user accounts, server-scored mock exams, synced progress, and a spring-physics (bencho.dev-inspired) frontend with no build step.

## Quick start

```bash
pip install -e .                     # installs the `idrive` command
idrive                               # → http://localhost:8765
# dev alternatives: pip install -r requirements-dev.txt && uvicorn app.main:app --reload
# flags: idrive --host 0.0.0.0 --port 8000 --reload
```

Run checks:

```bash
python -m pytest -q     # or: make test   — 43 unit/API/data tests
python tools/smoke.py   # or: make smoke  — end-to-end happy path
python -m compileall -q app tests tools  # or: make lint
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
  static/        index.html + css + vanilla-JS modules (no build step)
  web/pages.py   versioned static serving + shell rendering
tools/           extract_data.mjs (source → JSON), smoke.py
tests/           pytest suite (unit, API contract, data integrity)
```

### Data flow

Learning content is extracted from `Sadak Saathi.html` by `tools/extract_data.mjs`, which evaluates the source script in a Node VM and serialises its data tables (255 signs, 9 categories, 18 topics + articles, 471 MCQs, 83 glossary terms) into `app/data/*.json`. The frontend boots from `/api/content/index` (text only) and lazily fetches sign SVGs, articles and the glossary.

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
