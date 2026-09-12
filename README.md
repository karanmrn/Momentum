# Streetwise

A three-area safety-information demonstration for Hounslow town centre, Camden Town centre, and West Croydon.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173.

Local PostgreSQL data persists in `.data/streetwise`. Docker and cloud credentials are not required.
Each browser has an isolated, 24-hour demonstration session.
Startup and new sessions remove up to 100 expired sessions per operation.
All reports, moderator actions, and inbox messages are fictional.
Public-source cards identify their real sources separately.

## Demonstrate the feedback loop

1. Choose Alex and Hounslow.
2. Submit a fictional infrastructure observation.
3. Switch to the moderator.
4. Review the report and approve a public summary.
5. Inspect the summary's evidence and timeline.
6. Switch to Alex and open the inbox.
7. Switch to the moderator and retract the notice.
8. Return to Alex and inspect the correction.
9. Choose Sam to compare explicit preferences.
10. Switch between all three pilot areas.

Opening an official service does not submit a report.
Demonstration persona switching does not authenticate a real operator.
Do not enter real personal information or allegations.

## Checks

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

The planning pack's acceptance matrix remains a specification.
Only executable tests and recorded runs establish implementation evidence.

## Vercel preparation

The repository includes Vercel build and API configuration.
Use a separate PostgreSQL database for the invited demonstration.
Apply both SQL files in `supabase/migrations` in filename order using its database administrator.
Use a dedicated database administrator connection that can assume `streetwise_demo_app` and delete expired demo sessions.
Set `DATABASE_URL` and a random `DEMO_ACCESS_CODE` with at least 16 characters.
Hosted demonstration API access uses HTTP Basic authentication with username `demo`.
Public source routes under `/api/public` allow reading without authentication.
Static application assets contain no private report data.
Keep keys server-only. Do not prefix secrets with `VITE_`.
Test hosted routing, cookies, and storage before inviting users.

## Source extraction

The optional Context.dev adapter requires `CONTEXT_DEV_API_KEY`.
Use `.env.local` for local credentials. Never commit that file.
Automated source tests use mock responses and make no paid calls.
Acquisition documents remain review-required internal evidence.

## Responsive website and source coverage

Mobile uses a list-first layout, a map switch, and four navigation tabs.
Desktop shows the map and local information together.
Preferences and research remain separate from the main mobile tabs.

Source cards identify their publisher, retrieval date, coverage, and original link.
Help listings include source-backed addresses and published schedules where available.
A listed venue does not confirm that staff can help now.
Lighting samples describe council infrastructure records, not current lighting faults.
Historical publication coverage does not establish local crime totals or a risk estimate.
Fictional community reports retain their separate labels and review workflow.

Historical context includes an acquisition snapshot for each area.
It records 36 monthly Police.uk source files per research query, covering August 2023 through July 2026.
The query circles are not approved pilot boundaries. Crime totals remain unpublished.
Transport, Census, and police-priority snapshots have separate source dates and geography labels.
The interface shows the missing genuine community dataset explicitly.
Raw acquired records remain local and are excluded from public repository history.

## Controlled pilot requirements

The current schema isolates fictional sessions. It is not the production report schema.
Real intake requires authenticated accounts, domain-level RLS, moderation staffing, and reviewed retention rules.
Pilot boundaries and station identifiers remain unapproved.

## Accounts and evidence graph

The Account button supports Supabase email signup, confirmation, login, and logout.
Configure the selected project's server variables and confirmation URLs using [the account contract](docs/auth/CONTRACT.md).
Without configuration, the UI states that accounts are unavailable. It does not simulate a successful login.
Real accounts do not grant access to demo moderator roles or enable real report intake.

Historical context includes an accessible evidence graph with source links, acquisition months, and relationship meanings.
Public mode exposes source coverage only. Demo mode adds current, reviewed fictional community notices.
Police coverage describes acquired source files, not local crime totals or confirmation of a community claim.

The demo graph uses PostgreSQL snapshot, node, and assertion tables with session isolation and expiry.
Graph reads rebuild from locked authoritative state. State mutations invalidate stored projections within the same transaction.
Withdrawal therefore removes dependent graph relations. Graph traversal never includes private reports or account identities.
See [the graph implementation](docs/semantic-graph.md) for storage, ontology, and Graphify limits.
External alerts, automatic reporting, and AI publication remain disabled.
Historical correlation returns insufficient-data status.

See `docs/decisions/001-demonstration.md` for ownership and the frozen API contract.
The original plan remains in `generalist.md`.
