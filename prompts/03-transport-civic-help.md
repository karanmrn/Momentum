# Codex thread 03 — Transport, civic and help-directory connectors

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00; thread 01 identifiers and registry interfaces.  
**Suggested branch:** `codex/safety-03-transport-civic-help`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `services/ingestion/src/tfl/**`
- `services/ingestion/src/civic/**`
- `services/ingestion/src/help/**`
- `services/ingestion/src/shared/**`
- `tests/connectors/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement one real TfL source integration with exact source scope and timestamps. Do not transform a line disruption into an invented station-exit closure.
2. Implement directory schema and manual reviewed entries for permitted council schemes. Separate registered/scheduled/confirmed availability, source age and eligibility.
3. Implement Hounslow/Croydon civic adapter interfaces and only activate permitted read endpoints whose schema/reuse are validated. Do not scrape restricted BID data.
4. Create bounded fetch helpers, conditional retrieval, parser validation, job checkpoints, source-health states and source-specific removal/expiry semantics.
5. Camden street-lighting inventory is an asset source, not a functioning-light feed. Resolve canonical dataset versus derived map before ingesting.
6. Expose schedules/worker functions as pure callable operations; ask thread 00 to wire deployment schedule. Keep long backfills out of scheduled request budget.

## Acceptance evidence

- Failed fetch does not resolve notices.
- Old content re-fetch does not renew event time.
- Future notices not active early.
- Overnight schedule/DST tests.
- Incomplete snapshots do not delete active events.
- Permission-blocked feed remains disabled.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
