# Codex thread 05 — Knowledge graph and relation engine

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 ontology; records/interfaces from 02/03/04.  
**Suggested branch:** `codex/safety-05-knowledge-graph`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `packages/graph/src/**`
- `apps/web/src/features/evidence/**`
- `netlify/functions/evidence-*.ts`
- `tests/graph/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement typed nodes and qualified assertions using approved domain storage interfaces and coordinator migrations.
2. Materialise provenance, place, source-revision, contextual-history and approved operational relations. Add source family/derivation tracking.
3. Implement bounded uncertainty-aware candidate generation for allowed source pairs, human review decisions and reversible cluster split/merge history.
4. Hard-block monthly police proximity from individual incident confirmation. Do not add offender/person identity relations or generic transitive same-as.
5. Build the user evidence card/timeline and a bounded moderator graph inspector with accessible table. Authorise before traversal and suppress private count/path leaks.
6. Implement retraction/supersession invalidation for derived assertions and public projections, with tests consumed by notifications.

## Acceptance evidence

- Same point/month is context only.
- Copied source families not independent corroboration.
- Unknown precision not exact.
- Candidate transitivity never identity.
- Private edge existence not inferable.
- Retraction removes derived current evidence and links.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
