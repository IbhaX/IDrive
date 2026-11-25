# Content review register

Status tracker for learning content shipped in `app/data/`. **Required before public launch.**

## Review status summary

| Area | Status | Owner |
| --- | --- | --- |
| Sign names/meanings (255) | ⚠ Needs verification against official IRC:67 signage | unassigned |
| Theory articles (18) | ⚠ Facts unverified; rules change over time | unassigned |
| MCQ bank (471) | ⚠ Answers sampled but not formally reviewed | unassigned |
| Glossary (83) | ⚠ Unreviewed | unassigned |
| Malayalam text (all) | ⚠ **Not reviewed by a native speaker** | unassigned |

## Built-in safeguards already in place

- Stories/anecdotes in articles carry an `illustrative` flag and render an "Illustrative story, not a real event" label.
- The footer and every article show: "Rules change — confirm with the MV Act / your RTO / Parivahan before acting."
- No fine amounts are stored in the data (penalties change too fast to hard-code).
- Content ships with a version hash (`meta.json`); corrections need a data edit + re-extract, not a code change.

## Known unverified facts / items to check

These were flagged during the port as needing verification against current official sources (Motor Vehicles Act as amended, CMVR, IRC codes, Kerala/State RTO practice):

1. **Speed limits cited in articles** (e.g., defaults for urban/highway stretches) — limits are notified per road and change; verify wording is generic enough or update.
2. **Document validity periods** (LL validity, DL renewal windows, PUC/fitness validity) — rules amended in recent years.
3. **Demerit-points / licence-suspension thresholds** described in the violations topic.
4. **Helmet/seat-belt/bike-seating specifics** — state-level enforcement varies; article wording should stay generic.
5. **Hand-signal descriptions** — verify against the official signals in the driving-licence syllabus.
6. **Number-plate (HSRP) rules** — colour coding and font rules have been amended (e.g., EV green plates, BH series).
7. **Alcohol limit (30 mg/100 ml)** — confirm the figure and phrasing; keep it as a limit, not an allowance.
8. **Mobile-phone / distracted-driving rules** — penalties amended; keep fine amounts out, verify the prohibition wording.
9. **Glossary translations** — several Malayalam renderings are informal; have a native speaker review register and tone.
10. **Sign artwork** — procedurally generated SVGs are approximations of official shapes; check a sample against IRC:67 plates.

## How to update

1. Edit the content inside `Sadak Saathi.html` (the source of truth) or the generated JSON only as a stopgap.
2. Run `node tools/extract_data.mjs` — counts must stay consistent or the extraction checks fail.
3. Update this file: move the item from ⚠ to ✅ with reviewer + date.
4. Commit source + regenerated `app/data/*.json` together.

## Sign-off log

| Date | Reviewer | Scope | Result |
| --- | --- | --- | --- |
| — | — | — | — |
