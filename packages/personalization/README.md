# Private preference workspace

This module stores explicit choices and an in-app inbox inside the current demonstration session. All examples remain fictional.

## Integration

Add `personalization?: PersonalizationState` to `DemoState`. Import this type from `packages/personalization/schema.ts`.

Mount `createPersonalizationRoutes(store)` at `/api/personalization`, after the existing session, persona, origin, and JSON middleware.
The router requires trusted `response.locals.sessionId` and `response.locals.persona`. It accepts no request-selected identity.

Mount `PersonalizationWorkspace` for `?workspace=preferences`. Its optional `onExit` callback returns to the main application.

Replace legacy member feed selection with `relevantNotices(state, persona, now).map(row => row.notice)`.
Preserve `reasonCodes` and `reasons` when the caller can show them.
Run `dispatchPersonalUpdates` inside `Store.mutate` for the in-app lifecycle. Never attach an external provider.
Legacy notification output has a different shape. Its route must use this module's inbox contract when switching.

The router accepts a trusted `contexts(state)` adapter. It can supply explicit station, zone, access, transport, and language source tags.
The adapter can also supply effective intervals and current source status. Request bodies cannot supply these tags.
Without source tags, unknown station membership and access needs remain unknown. Exact candidate place labels can match existing examples.

## Behavior

Settings use revision checks. Conflicting edits receive HTTP 409 and preserve the browser draft.
London windows use civil time, including overnight windows and both repeated autumn clock hours.
Quiet hours defer delivery. Pause, mute, unsubscribe, expiry, and changed revisions stop pending delivery.
Corrections can reach prior recipients after scope changes. Delivery still respects mute, pause, deletion, quiet hours, and channel opt-out.

The outbox permits 300 entries per member. Each event permits three attempts, with five-second and ten-second retry delays.
Generic event messages contain no copied report content. Opening an event resolves current permitted content.
Withdrawn and expired content does not return through event details.

Demonstration freshness limits start at observation time: infrastructure 48 hours, transport two hours, access 12 hours, community 24 hours.
An explicit earlier source expiry wins. A new fetch never renews the observation.
These limits need source policy review before production use.

Historical digest consent exposes acquired historical coverage metadata separately. It never creates current alerts or approved crime totals.
Export and deletion affect the selected member's preferences and inbox. They do not delete reports or another member's data.

## Verification

Run these commands from the repository root:

```sh
./node_modules/.bin/vitest run tests/personalization
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/playwright test --config tests/personalization/playwright.config.ts
```

The browser harness binds only to localhost. It is a test entry, separate from the application server.
Browser cases use the real API and database. They cover 320px, 390px, 1440px, persistence, mute, deletion, and conflicting edits.
API cases cover session isolation, current content, concurrent writes, duplicate dispatch, and corrections during transaction waits.
Domain cases cover DST, overnight windows, source eligibility, explicit reasons, retries, TTL, corrections, and unsubscribe after queueing.

## Boundaries

Real account storage belongs to the account workstream. No production subscriber or device receives these fictional events.
External push remains disabled. Station identities do not establish live transport notices or a location's safety.
Candidate place and zone boundaries remain unreviewed. This module does not infer personal risk or demographic attributes.
