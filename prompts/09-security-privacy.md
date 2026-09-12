# Codex thread 09 — Security, privacy and abuse validation

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Begin after 00; review all merged components.  
**Suggested branch:** `codex/safety-09-security-privacy`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `tests/privacy/**`
- `tests/security/**`
- `docs/security/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Read the threat model and inspect actual flows for identity, location, allegations, exports, graph paths, caches, logs and model inputs.
2. Write adversarial RLS/API tests for cross-user access, role spoofing, cross-area partner/moderator scope, private path/count inference and unsafe views/RPCs.
3. Test source fetch controls, bounded input, prompt injection isolation if AI present, XSS, rate bounds, idempotency misuse and secret exposure.
4. Review intake/retention/deletion/appeal/correction behaviours and kill-switch enforcement; compile unresolved legal/operational launch gates without pretending to be legal signoff.
5. File actionable defects with owning threads; do not silently rewrite their modules. Re-test actual fixes.
6. Verify synthetic/live separation and that a public preview cannot send real warnings or reset a production database.

## Acceptance evidence

- Execute owned adversarial tests.
- Report actual passed/failed/blocked state with evidence.
- No blanket production-ready claim.
- High-severity unresolved gate keeps relevant public feature off.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
