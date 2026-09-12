# Codex thread 06 — Personal relevance and notification lifecycle

## Mission

Implement this workstream for the three-area safety application. Read `generalist.md`, `AGENTS.md`, `contracts/domain.ts`, `contracts/API_RULES.md` and your relevant documents under `docs/` before editing. Paths below refer to the target application repository; the planning pack may live under `planning/three-area-safety/`.

**Dependency:** Thread 00 notice/preference contract; 04 publication events; 05 evidence semantics.  
**Suggested branch:** `codex/safety-06-personalization-alerts`. Use an independent worktree created from the coordinator's common-base commit.

## Exclusive primary ownership

- `packages/personalization/src/**`
- `packages/notifications/src/**`
- `netlify/functions/preferences-*.ts`
- `netlify/functions/notifications-*.ts`
- `netlify/functions/personal-feed*.ts`
- `tests/personalization/**`
- `tests/notifications/**`

Shared contracts, root manifests/lockfiles, database migrations and deployment environment configuration belong to thread 00. When your change needs them, submit the smallest contract/migration request with tests; do not silently fork the shared model. Existing repository conventions may change directory names only through the coordinator.

## Required implementation

1. Implement owner-private explicit preferences and relevance eligibility followed by versioned explainable ordering.
2. Make two users with different station/category settings see appropriately different feeds and clear reasons, without collecting demographic risk profiles.
3. Implement transactional outbox/in-app inbox with idempotency, current-state recheck, subscription changes, quiet hours, expiry and correction dispatch.
4. Historical digest is separate opt-in and never current-danger eligibility. Initial community summaries remain in-app under policy.
5. Keep external push optional/gated and generic on lockscreen; do not claim universal mobile background delivery.
6. Request privacy-aware API contracts/migrations from coordinator and prove no shared-cache/graph preference leaks.

## Acceptance evidence

- User A/B cache isolation.
- Unsubscribe after enqueue suppresses send.
- Duplicate retries not duplicate inbox rows.
- Resolved/retracted notice cancels old queued delivery.
- Historical counts rejected.
- DST/overnight preferences correct.

Read `tests/acceptance_matrix.json` and implement the scenarios assigned to this thread. Coordinate cross-feature tests rather than claiming another team's tests passed.

## Non-negotiable constraints

No mental-health scope, borough fear ranking, live warning from monthly counts, offender graph, personal-risk probability, private-feed scraping, automatic crime reporting or unreviewed public allegation. Account/review/source authority are separate. Precision, uncertainty, source lineage and correction must survive every transformation. Do not make model similarity or correlation a truth percentage.

Use typed fixtures when dependencies are blocked, label them synthetic, and keep production gates off. A fixture-only adapter is not a live integration. Preserve user work and never apply database resets to shared/production resources. No paid service/plan change or live external notification is authorised by this prompt.

## Return format

Return: changed files; commands actually executed; test pass/fail/blocked evidence; exact source/permission or interface blockers; proposed integration/migration requests; remaining risks; next merge dependency. Complete functional code in scope, not only a plan. Do not claim clinical/public-safety/regulatory validation or deployment unless genuinely established.
