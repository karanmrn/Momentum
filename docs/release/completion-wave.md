# Momentum completion wave

This release extends the fictional demonstration and public source views.
Five root subagents implemented and reviewed separate scopes. Two existing tasks supplied the graph explorer and presentation.

## Delivered changes

- Research consent persists in private demo sessions. It records purpose, consent version, and access expiry.
- Withdrawal removes answers and aggregate eligibility. Expired sessions lose access; physical cleanup runs later.
- Private account preferences include stations, access needs, transport, language, time windows, quiet hours, and muted notices.
- Preference revisions reject stale saves. Existing account export and deletion include the settings.
- Graphs include bounded MPS borough context, verified ONS area context, and exact-ID police outcomes.
- Source snapshots and availability assertions retain dates, precision, and uncertain operational status.
- Graph controls provide type and source filters, keyboard zoom, selected details, and equivalent records.
- The area graph explorer supports all three pilots and explains source relationships without asserting causation.
- Local research browsing uses bounded, read-only pages. Its records and downloads remain marked unpublished.
- View, tab, and area links survive reload and browser navigation. Role checks still restrict review views.
- Ten source-registry entries now cite implementation evidence. Reuse and automation gates remain separate.
- The supplied ten-slide pitch deck links to town updates, police records, and community reports.
- Presentation round trips retain the selected town and slide. Local report trials use explicit fictional sessions.

## Fixes found during integration

The new graph types required updated database constraints. A local migration ledger prevents older constraints from replaying on restart.
Populated old and enriched databases pass upgrade and restart checks without data deletion.
The Graph view link initially overlapped Account on small screens. Explicit header rows keep both controls reachable.
A muted-notice field removed newlines during typing. Separate text state now preserves multiple identifiers.
The expanded browser suite exceeded a shared test request budget. Graph tests now use a separate local server.
Production request limits remain unchanged.
The graph loads separately, reducing the initial application bundle from 705 kB to 384 kB before compression.

## Verification

The combined unit, API, model, and database run passed 717 tests across 79 files.
The first browser run passed 95 of 100 tests. Header overlap and shared test limits caused the five failures.
The final browser run passed all 101 tests in 1.3 minutes.
It used five isolated servers.
An unrestricted concurrent unit run hit a database startup timeout. The final unit run used four workers. Changed TypeScript and CSS files passed formatting checks.
A final public-view guard rejects local DatasetRecord payloads. All 15 affected graph browser tests passed after this guard.
TypeScript, production build, native ESM startup, and focused review checks passed.

## Remaining boundaries

Supabase creation was attempted in the user-selected pubmax organization. The provider rejected its two-project free limit.
No existing project was paused or upgraded. Hosted accounts, private workflows, and scheduled updates remain unconfigured.
The acquired 135,053 records remain local. No hosted import is claimed.
GitHub Actions cannot start because the GitHub account is locked for billing.

Native iOS and Android applications are not implemented.
Real participant consent operations, moderation staffing, source permissions, pilot boundary approval, and physical-device checks remain outstanding.
General asset inventory, live help availability, all-source revision history, refresh operations, and real notification channels remain incomplete.
This release does not claim that every roadmap item or acceptance case is complete.
