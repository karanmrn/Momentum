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
No public deployment has been performed.
Use a separate PostgreSQL database for the invited demonstration.
Apply `supabase/migrations/001_demo_sessions.sql` using its database administrator.
Use a dedicated database administrator connection that can assume `streetwise_demo_app` and delete expired demo sessions.
Set `DATABASE_URL` and a random `DEMO_ACCESS_CODE` with at least 16 characters.
API access uses HTTP Basic authentication with username `demo`.
Static application assets contain no private report data.
Keep keys server-only. Do not prefix secrets with `VITE_`.
Test hosted routing, cookies, and storage before inviting users.

## Source extraction

The optional Context.dev adapter requires `CONTEXT_DEV_API_KEY`.
Use `.env.local` for local credentials. Never commit that file.
Automated source tests use mock responses and make no paid calls.
Acquisition documents remain review-required internal evidence.

## Controlled pilot requirements

The current schema isolates fictional sessions. It is not the production report schema.
Real intake requires authenticated accounts, domain-level RLS, moderation staffing, and reviewed retention rules.
Pilot boundaries and station identifiers remain unapproved.
External alerts, automatic reporting, and AI publication remain disabled.
Historical correlation returns insufficient-data status.

See `docs/decisions/001-demonstration.md` for ownership and the frozen API contract.
The original plan remains in `generalist.md`.
