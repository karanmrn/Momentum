# Codex thread 02 — Historical crime ingestion and aggregates

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 contract; thread 01 area interface (fixtures permitted initially).  
**Suggested branch:** `codex/safety-02-historical-police-data`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `services/ingestion/src/police/**`
- `scripts/backfill/**`
- `packages/history/src/**`
- `tests/history/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement Police.uk metadata, categories, bounded polygon/month ingestion and checkpointed backfill. Record actual available months, raw-source checksums and parser version.
2. Preserve multiplicity at anonymised points; make reruns idempotent by source scope/version without assuming missing persistent IDs mean duplicates.
3. Implement historical approved-area aggregates, explicit missing/partial/zero coverage and source period. Preserve actual offence taxonomy and BTP provenance.
4. Add optional MPS catalogue/download adapter with source-specific geography/category mappings and no addition of overlapping counts.
5. Respect suppression, no exact sexual-offence reconstruction, no occurrence-hour inference and no alert generation from historical counts.
6. Return real input manifest only when downloaded; otherwise typed fixtures and blocked status. Never copy Grok borough totals into a town-centre seed.

## Acceptance evidence

- Duplicate imports do not change counts.
- Two legitimate records at same location survive.
- Null identifiers and revised snapshots handled.
- Missing month is not zero.
- Category/coordinate query tests.
- Historical output cannot enter current-alert eligibility.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
