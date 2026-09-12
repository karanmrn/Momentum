# Account and graph verification

Run date: 12 September 2026.

## Delivered

Supabase account UI and verified backend identity are separate from demonstration personas.
Email confirmation, login, logout, unavailable configuration, and session recovery have tested interface states.
Account code loads when the dialog opens, keeping the initial application bundle below the build warning threshold.

The evidence graph joins reviewed fictional notices with public police acquisition metadata and source lineage.
PostgreSQL stores session-scoped derived nodes and assertions. Withdrawal invalidates these records within the state transaction.
Map and transport changes from PR 6 are included in the combined test run.

## Executed checks

| Check | Result |
| --- | --- |
| `npm test` | 376 tests passed across 43 files |
| `npm run build` | TypeScript and production build passed; no chunk-size warning |
| `npm run test:server` | Native Node ESM startup and public routes passed |
| `npx playwright test --config .data/playwright-integration.config.ts --output .data/integration-results` | All 29 browser journeys passed |
| `git diff --check` | Passed |

The temporary browser configuration uses port 4289 and an isolated in-memory database.
It preserves the repository's browser tests and canonical sharing URL.
Tests cover account errors and recovery, mobile layouts, graph bounds, withdrawal, moderation, transport expiry, map fallback, and presentation sharing.
The SQL tests use a restricted database role to check session isolation, expiry, rollback, and invalid graph references.

Independent review found a restored-session outage that appeared as logout. The fix preserves the error and offers retry.
Another review separated the browser graph schema from server-only imports.

Production smoke testing found graph requests rejected by the strict query parser after hosted routing.
The endpoint validates only the area parameter, as the other public routes do.
Extra parameters cannot alter the fixed projection. Duplicate or invalid areas are rejected.
The regression verifies host metadata and unsupported parameters cannot change the returned graph.
After this fix, the three graph HTTP tests, two graph browser journeys, production build, and native startup passed again.

## Unverified live operations

The connected Supabase account lists two projects. Neither is named Streetwise.
The user must select the target before project configuration or live signup testing.
Provider calls were mocked during automated tests. No test created an account or sent an email.
No production database migration was applied.
Hosted graph storage requires both migrations in the dedicated demonstration database.

Real community publication and intake remain disabled. Police coverage does not establish local crime totals or individual report matches.
Graphify was assessed as optional offline analysis tooling. No extraction or external model call ran.
Avrea was previously blocked by repository availability and exhausted credits; these checks ran locally.
GitHub Actions was blocked by the account billing lock. Local results do not imply a completed GitHub Actions run.
