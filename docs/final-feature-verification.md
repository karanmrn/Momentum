# Feature integration verification

Verified on 12 September 2026, from main `6604167` plus the combined feature branch.

## Delivered

- Original fictional scenario selection fills the demo form. Submission remains explicit.
- Owners can correct their unreviewed private reports. Revision conflicts preserve their draft.
- Camden historical context links to the evidence example. Correction and withdrawal change only its fictional graph.
- Camden police records retain broad categories, approximate locations, and source limits.
- The Camden Safety Bus date exception is already merged and verified through the production help endpoint.

## Executed checks

| Command | Result |
| --- | --- |
| `npm test` | 420 tests passed across 47 files. |
| `npm run build` | TypeScript and production build passed. |
| `npm run test:server` | Native ESM startup and all three public dataset routes passed. |
| `npx playwright test --config .data/feature-integration.config.ts --output .data/final-results` | 32 browser tests passed in 18.4 seconds. |
| `git diff --check` | Passed. |

The temporary Playwright configuration changes only the test path and local ports to 4311 and 4312.
The committed configuration separates core and feature tests onto independent servers.
An earlier shared-server run exhausted the request budget. Isolation fixed this test interference without changing production limits.
The Camden browser test also runs nine source, correction, withdrawal, and responsive checks.
Independent reviews found no blocking issues in the scenario picker or Camden evidence implementation.

## Deployment limits

GitHub Actions cannot start because the GitHub account has a billing lock. Local results do not imply hosted CI passed.
Supabase login UI is implemented and tested with mocked provider responses.
Live confirmation and login remain unverified until the intended Supabase project and deployment configuration are selected.
Hosted private storage also needs an explicitly selected database and reviewed migrations.
Real intake, external alerts, and production research participation remain gated.
The Camden evidence graph is a local learning example, not a match between police records and community reports.
See `docs/reports/remaining-acceptance.md` for unresolved product and setup decisions.
