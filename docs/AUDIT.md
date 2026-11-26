# iDrive - repository audit and transformation plan

Audit date: 2026-11-25 · Base commit: `bf8954d`

## 1. What exists

| Area | Finding |
| --- | --- |
| Backend | FastAPI (async), SQLAlchemy 2 + SQLite (WAL), pydantic-settings, slowapi rate limits. Layering `api/ → services/ → models` is clean and consistently typed. |
| Auth | Email/password (pbkdf2 + pepper), hashed bearer sessions (30 d), optional Google ID-token sign-in. Solid. |
| Progress | One JSON blob per user, optimistic-concurrency versioning, 409 → client re-merge. `ProgressData` allows extra keys, so new progress fields need no migration. |
| Exams | Server-built 30-question mock papers; answer key never leaves the server. Practice sets + sign quiz ship answers by design. Well tested. |
| Content | Generated from `Sadak Saathi.html` by `tools/extract_data.mjs`: 255 signs (incl. 30 dashboard lights, 17 controls), 9 categories, 18 bilingual theory articles, 471 bilingual MCQs, 83 glossary terms. |
| Frontend | Vanilla JS modules, no build step, hash routing, event delegation via `data-*` attributes, bilingual helpers, GSAP vendored (Flip, ScrollTrigger, DrawSVG, MotionPath, CustomEase). "Aurora" dark/light design system. |
| Tests | 43 pytest tests (unit, API contract, extraction-drift guard) + `tools/smoke.py`. No browser/visual tests. |
| Deploy | Dockerfile (non-root), env-driven config, production pepper check. |

## 2. Gaps against the brief

1. **No curriculum structure.** Content is a flat list of 18 articles; no modules → chapters → lessons, no learning objectives, no knowledge checks inside lessons, no references or verification dates.
2. **Vehicle knowledge is shallow.** One "Know your vehicle" article; no engine, transmission, drivetrain, EV or safety-system lessons; no clickable vehicle diagram.
3. **Dashboard lights** exist only as sign tiles (name/meaning/action) - no severity model (stop now vs. get checked), causes, "if ignored", or "when to call a mechanic".
4. **No interactive learning beyond quizzes.** No science lab, no mechanical animations, no hazard-perception scenarios, no reaction-time exercises.
5. **No AI instructor.**
6. **Progress** tracks signs and quizzes only; no lesson completion, levels, streaks, bookmarks, recently viewed or readiness.
7. **Navigation** covers five sections; no home page, no global search, no breadcrumbs.
8. **Animations** are not all scoped: `Motion.enterView` exists but views don't use it, so ScrollTrigger-style work would leak between routes.
9. **Legal content** carries disclaimers but no section references, sources or verified dates.

## 3. Constraints honoured

- Keep the stack: FastAPI + vanilla JS + vendored GSAP, no frontend framework, no build step.
- Do not hand-edit generated `app/data/*.json`. New curriculum content lives in `app/data/curriculum/` and is **authored** (not generated); the extraction drift guard is untouched.
- Keep the answer-key rule, the progress merge contract (extended, not replaced), the `data-*` event contract and the CSS class contract.
- No fine amounts anywhere. Legal statements cite the Act/Rule and carry a verified date; state-level items are labelled.
- Simulations are labelled educational models.

## 4. Implementation plan

| Phase | Work | Status |
| --- | --- | --- |
| 1 | Audit (this file) | done |
| 2 | Navigation: Home, Learn, Signs, Vehicle, Science, Hazards, Tests, Instructor, Progress; global search; breadcrumbs; design-system extensions | done (first pass) |
| 3 | `Motion` extensions: scoped view contexts, scroll reveals, progress rings, magnetic buttons - all with reduced-motion paths | done |
| 4 | Curriculum architecture: `app/data/curriculum/*.json`, validated service, `/api/curriculum/*`, search index, tests | done |
| 5 | Curriculum content: 12 modules, verified lessons, references | first tranche - see `content_review.md` |
| 6 | Interactive: stopping-distance lab, reaction test, four-stroke engine, vehicle explorer, warning-light library, hazard perception | done (first pass) |
| 7 | AI instructor: retrieval over curriculum, OpenAI-compatible provider, citations, search-only fallback | done |
| 8 | Dashboard: lesson completion, levels, streak, bookmarks, recent, readiness | done |
| 9 | Accessibility/performance pass | partial |
| 10 | Playwright visual checks (desktop/mobile, dark/light) | partial - `tools/visual_check.py` |

## 5. Known issues found during the audit (not yet fixed)

- `requirements-dev.txt` repeats every runtime dependency already pulled in by `-r requirements.txt`.
- `FastAPI(version="0.1.0")` disagrees with `pyproject.toml` `1.0.0`.
- CSP allows `'unsafe-inline'` styles (needed by inline `style=` attributes across views).
- Mock-exam UI strings and some theory views still rely on `confirm()` for sign-out.
