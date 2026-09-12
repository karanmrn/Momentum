# Remaining acceptance gaps

Scope: current main `26d212e` plus owner editing and the fictional scenario picker.
This list separates missing implementation from setup and review decisions.

| Item | Evidence | Remaining work |
| --- | --- | --- |
| Owner correction controls | `src/ReportEditor.tsx` and `server/routes.ts` implement private edits for unreviewed reports. | Implemented and browser-tested. Conflicts preserve the draft and prevent overwriting newer revisions. |
| Corrections after publication | `Report.status` and `decisionSchema` in `packages/contracts/index.ts`; owner edits require submitted status. | A reviewed owner correction request and appeal workflow need a defined review process. Existing withdrawal remains available. |
| Real account activation | `server/account.ts` validates project configuration; `docs/auth/CONTRACT.md` records setup limits. | Select the Supabase project and verify confirmation, login, logout, and deployment settings. No project is selected by this work. |
| Real owner-private intake | `Report.owner` uses `Persona`; `server/app.ts` creates demo sessions; `reportInputSchema` requires synthetic data. | Add authenticated UUID ownership and tested RLS before real report intake. Authentication alone does not enable it. |
| Approved area totals | `config/pilot_areas.json` has null geometry and proposed review status. `packages/history/src/coverage.ts` returns boundary review required. | Review versioned pilot polygons and map source records to those areas before publishing totals. |
| Independent community observations | `research/datasets/coverage.json` has not-collected community cards. `packages/community-demo` contains original fiction. | Collect consented observations or permissioned data. Fiction cannot establish actual local conditions. |
| Research persistence | `packages/recruitment/ResearchPanel.tsx` stores its fictional state in component memory. | Design approved consent, retention, withdrawal, and protected storage for real research participation. |
| Operational publication and alerts | `config/feature_flags.json` records disabled public intake, partner publishing, external push, and live AI. Existing domain notifications are in-app demo records. | Complete operational reviews and provider delivery tests before enabling external channels. |
| Hosted private storage | `api/index.ts` requires `DATABASE_URL` for demo state. `server/database.ts` manages session isolation and graph projections. | Select and configure the isolated hosted database, apply reviewed migrations, and verify live RLS. Public source pages work without it. |

No protected-attribute risk inference, offender identity graph, private-feed scraping, or route safety guarantee is part of the remaining work.
This change does not claim that the full production acceptance plan is complete.
