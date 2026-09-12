# First implementation

The user approved the demonstration-first scope on 12 September 2026.
The reporting feedback loop is the primary journey.
All user reports and operator actions use fictional data.
Three pilot areas share one application.
Vercel is the hosting target. No public deployment is authorised yet.
No Git remote was supplied. This local repository preserves the planning package.

## Storage

Use local PGlite Postgres for the demonstration because Docker is unavailable.
Each browser receives a random server-issued session cookie.
Demo personas operate only inside that isolated session.
Persona switching is simulation, not production authentication.
A hosted PostgreSQL connection is required for persistent Vercel API storage.
Real public intake, external sending, and AI remain disabled.
The controlled pilot still requires Supabase Auth, full domain-table RLS, and operational approval.

## Ownership

The coordinator owns contracts, migrations, database storage, server wiring, manifests, and integration tests.
The interface worker owns src/.
The workflow worker owns packages/domain/, server/routes.ts, and tests/domain/.
The source worker owns services/, tests/sources/, and source verification evidence.
Workers use separate branches and worktrees from the common foundation commit.

## Frozen HTTP contract

All routes return Envelope<T>. Errors use schemaVersion, error.code, error.message, and requestId.
All demo data routes require an isolated cookie and use Cache-Control: no-store.
POST /api/session accepts {persona: alex|sam|moderator}; GET returns SessionView.
GET /api/areas returns Area[].
GET /api/feed?area=PilotId returns Notice[].
GET /api/notices/:id returns Notice, including the latest revision.
GET /api/notices/:id/evidence returns EvidenceGraph with only public-safe nodes.
GET /api/reports returns the current persona's Report[].
POST /api/reports accepts ReportInput and requires Idempotency-Key.
PATCH /api/reports/:id accepts {expectedRevision, action: withdraw}.
GET /api/moderation?area=PilotId returns Report[] for the moderator.
POST /api/moderation/:id/decision accepts DecisionInput and requires Idempotency-Key.
The decision ID is a report ID, including resolve and retract actions after approval.
GET /api/preferences returns Preferences. PUT accepts PreferencesInput.
GET /api/me/feed returns personalised Notice[].
GET /api/me/notifications returns Notification[].
POST /api/me/notifications/dispatch dispatches the current persona's queued inbox items.
GET /api/sources?area=PilotId returns SourceCard[].
GET /api/help?area=PilotId returns HelpCard[].
GET /api/history?area=PilotId returns {status: insufficient_comparable_data, estimate:null, explanation:string}.

The moderator can review all three areas inside their own fictional session.
Alex defaults to infrastructure in Hounslow. Sam defaults to transport in West Croydon.
Preferences can change. Tests must prove isolation between sessions and personas.
