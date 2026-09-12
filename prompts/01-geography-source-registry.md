# Codex thread 01 — Geography and source registry

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 contract frozen.  
**Suggested branch:** `codex/safety-01-geography-source-registry`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `packages/geography/src/**`
- `config/areas/**`
- `services/ingestion/registry/**`
- `tests/geography/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Review the three proposed scopes. Generate valid custom polygons with version, CRS, provenance/checksum and explicit review-pending status until accepted.
2. Resolve actual TfL station/facility IDs and parent/child transport relationships. Search terms in the pack are not IDs; do not invent them.
3. Implement coordinate conversion, point/boundary handling and query-footprint versus published-area distinction. GeoJSON lng/lat differs from Police.uk polygon convention.
4. Turn source_registry.json into typed registry entries with independent availability, reuse approval, authority scope and connector status.
5. Keep unmet licences/feed access blocked; prepare useful manual source cards. Do not expand the app to entire boroughs or claim exact pilot counts.

## Acceptance evidence

- Polygon/CRS/order/boundary tests.
- Wrong station with similar name is rejected for manual review.
- Station centre never silently becomes an entrance.
- Unapproved source/boundary cannot enable live aggregation.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
