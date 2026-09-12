# Codex thread 07 — Consumer map, list and help experience

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 typed mocks; thread 01 areas; thread 03/06 APIs.  
**Suggested branch:** `codex/safety-07-consumer-map-experience`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `apps/web/src/features/map/**`
- `apps/web/src/features/feed/**`
- `apps/web/src/features/help/**`
- `apps/web/src/features/preferences/**`
- `apps/web/src/features/notifications/**`
- `apps/web/src/app/**`
- `tests/ui/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Build mobile-first functional area selection and Now/Community/Get help/Historical tabs with accessible equivalent lists.
2. Implement source class, actual period, freshness, unknown and correction labels at card level. No danger score or false all-clear empty state.
3. Integrate approved map geometry and historical layers, without doorstep crime markers or colour-only semantics. Compliant tile attribution and fallback required.
4. Implement preference controls/inbox screens using 06 APIs and link reporting/moderation/evidence modules owned by other threads.
5. Review directory labels: registered, schedule and confirmed current availability must remain separate. Display synthetic environment/data persistently.
6. Make every primary action work. Do not stop at a landing page, hardcoded demo-only map or unimplemented buttons.

## Acceptance evidence

- Keyboard and narrow-screen complete journeys.
- Readable current/historical distinction.
- Missing tiles still usable list.
- No login required for public info/help.
- No cross-user personalised cache.
- No fake successful copy/navigation actions.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
