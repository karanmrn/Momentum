# Codex thread 08 — Measurement and association research layer

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 contracts; actual coverage from 02/03/04.  
**Suggested branch:** `codex/safety-08-correlation-analytics`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `packages/analytics/src/**`
- `apps/web/src/features/analytics/**`
- `scripts/analysis/**`
- `tests/analytics/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement coverage matrix, registered research question schema and source-family/category/geography/time alignment checks.
2. Implement explicit insufficient_comparable_data/ineligible_measurement result states. Do not invent a launch-day community series.
3. Implement descriptive statistics with declared unit/common periods and optional justified rank correlation in a reproducible offline job.
4. Follow the dependence/multiplicity/held-out-review protocol before inferential output. No naive n=3 borough correlation or pseudo-independent cell-month significance.
5. Store analysis inputs/method/versions/diagnostics and private review state. Restrict public aggregate combinations and small-count reconstruction.
6. Provide synthetic demonstration clearly isolated from empirical results. Use only permitted source mappings, never infer women-only victims or an individual risk probability.

## Acceptance evidence

- Insufficient history returns null estimate and reason.
- Shared-source duplicates rejected as independent evidence.
- Sparse/constant/missing series handled.
- Units/boundaries/taxonomy mismatches rejected.
- Synthetic coefficient cannot publish as empirical.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
