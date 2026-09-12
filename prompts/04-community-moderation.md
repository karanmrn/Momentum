# Codex thread 04 — Accounts, private reporting and moderation

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 auth/storage contracts.  
**Suggested branch:** `codex/safety-04-community-moderation`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `packages/reporting/src/**`
- `packages/moderation/src/**`
- `apps/web/src/features/reporting/**`
- `apps/web/src/features/moderation/**`
- `netlify/functions/report-*.ts`
- `netlify/functions/moderation-*.ts`
- `tests/community/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement authenticated private observations with category, approximate place, time interval, firsthand/source distinction and minimal narrative. No identity/face/media intake.
2. Build report/correction/withdrawal screens and explicit official-reporting handoff. Never claim a submission to this app notified police.
3. Implement area-scoped moderation, redacted public summary, revision conflict handling, rejection/appeal and publication/withdrawal audit metadata.
4. Request required migrations/RLS from thread 00 rather than edit them. Add role-level tests against the actual local policies.
5. Keep source class separate from review status. Account verification is not claim verification. Private duplicate hints cannot reveal other submissions.
6. Implement intake/publication kill switches and no-staffing behaviour. A demo workflow is fully functional but visibly synthetic.

## Acceptance evidence

- Member cannot self-publish or self-assign official/moderator role.
- Owner-only reports; cross-area moderator denied.
- Withdrawn content removed from appropriate projections.
- Case-reference/private identity not exposed.
- Reporting route does not auto-submit externally.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
