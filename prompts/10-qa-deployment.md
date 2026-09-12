# Codex thread 10 — Integration QA, deployment and release evidence

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Foundation and integrated workstreams available.  
**Suggested branch:** `codex/safety-10-qa-deployment`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `tests/e2e/**`
- `docs/operations/**`
- `docs/release/**`
- `scripts/smoke/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement end-to-end three-area journeys with two synthetic users, private report, moderator, evidence explanation, personalised inbox and correction.
2. Verify build/type checks/unit/integration/RLS tests, source and permission statuses, layout/accessibility, timezone and provider-failure fallback.
3. Validate Netlify build/function behaviour and source-worker invocation in local/preview; coordinate root config changes with thread 00.
4. Prepare deployment/runbook/rollback steps, actual cost/credit questions and feature-gate evidence. Deploy only to authorised target and never invent URLs.
5. Produce release report separating implemented, mocked, blocked, permission-pending, tested and untested features.
6. Record a fictional demo narrative; do not fabricate public crimes, operational disruptions, partnerships or statistical results.

## Acceptance evidence

- Full correction flow passes.
- All three area configurations exercised.
- Actual deployment smoke results if authorised, otherwise explicitly not deployed.
- Outstanding defects and launch gates enumerated.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
