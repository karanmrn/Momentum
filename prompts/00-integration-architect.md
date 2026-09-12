# Codex thread 00 — Integration architect and contract owner

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Before all implementation threads.  
**Suggested branch:** `codex/safety-00-integration-architect`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `root manifests and lockfile`
- `packages/contracts/src/**`
- `supabase/migrations/**`
- `netlify.toml`
- `shared environment/configuration`
- `docs/decisions/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Inspect existing stack, branch state and instructions. Preserve compatible working code; document deviations from the proposed stack.
2. Translate the proposed contracts into runtime schemas, API envelopes and mock interfaces. Freeze area IDs, timestamps, precision, review/lifecycle semantics and graph predicates.
3. Create the repository skeleton, shared test commands and synthetic/live separation. Own the initial migrations with explicit grants/RLS and a migration-number register.
4. Define injected storage/adapter interfaces so parallel workers can test with typed fixtures without inventing services.
5. Commit the common foundation, publish exact ownership and dependency table, then integrate small worktree branches in order.
6. Resolve contract-change requests, run cross-feature checks and produce the final reality-based status report.

## Acceptance evidence

- Contract validation rejects impossible/public-private states.
- Application skeleton builds without live keys.
- No shared schema or migration ownership conflicts.
- Actual base commit and test commands are reported.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
