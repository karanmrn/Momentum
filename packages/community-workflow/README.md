# Momentum community workflow

This module extends the isolated fictional demonstration. It does not enable real public intake or external delivery.

## State and integration

Add this optional field to `DemoState`:

```ts
communityWorkflow?: import("../community-workflow/schema.js").CommunityWorkflowState;
```

Keep reports and notices in the existing domain store. The sidecar holds private workflow metadata and bounded discussion records.
All mutation helpers must run inside `Store.mutate`. The transaction must roll back when a helper throws.
Idempotency entries store hashes and result identifiers. They never retain copies of private narratives.

Mount `createCommunityWorkflowRoutes(store)` at `/api/community-workflow` after existing session, origin, and request-size guards.
Set `response.locals.persona` and `response.locals.sessionId` from the verified fictional session.
Set `response.locals.moderatorAreas` from server-owned membership. Missing moderator scope fails closed.

Before legacy report edits, withdrawals, and review decisions, call:

```ts
assertStandardWorkflowAllowed(state, reportId);
```

This prevents legacy routes from bypassing private-only publication preferences and sidecar withdrawal cleanup.
Keep legacy creation and existing simple reports unchanged.

Include `community_other_source` in `Evidence.sourceKind` and `Notice.sourceKind`.
Treat both community source kinds as community records in filters.
Approval marks other-source contributions explicitly. Private source descriptions never enter public summaries.

Mount `CommunityWorkspace({ persona, pilotId, onExit? })` at `?workspace=community`.
Keep the existing verified fictional persona controls available. Changing persona clears private component state.
The component uses its dedicated API. It does not depend on the old report form.

## Routes

All responses use the existing envelope and `Cache-Control: no-store`.
These routes remain within an isolated demonstration session.

| Route | Function |
|---|---|
| `GET /?area=...` | Owner reports, scoped review queue, private updates, and reviewed public summaries |
| `POST /reports` | Structured private intake |
| `PATCH /reports/:id` | Clarification response, appeal, correction, or withdrawal |
| `POST /reports/:id/review` | Scoped review, clarification, private review, publication, rejection, resolution, or retraction |
| `POST /notices/:id/discussion` | A member submits a private discussion update |
| `POST /discussion/:id/review` | A moderator approves a redacted update or rejects it |
| `PATCH /discussion/:id` | The update owner withdraws it |
| `POST /notices/:id/share` | Validate the current notice revision before preparing its link |
| `GET /notices/:id` | Resolve a current notice link or return safe not-found |

Every persisted mutation requires a bounded `Idempotency-Key`. Revision actions also require `expectedRevision`.
Sharing validates a current notice without sending anything externally.
Links resolve within the current fictional session. They do not expose the session to another browser.

## Lifecycle

Intake retains an approximate interval, time precision, source basis, optional narrative, and publication preference.
The optional narrative stays empty in the sidecar when omitted. The existing report stores an explicit omission marker.

Private-only reports cannot create notices. A moderator can complete a private review or request clarification.
Rejection reasons and appeals remain private. A reviewer can reconsider an appealed record.

An owner correction withdraws any previous public summary before another review.
The workflow receipt remains stable. A new private report carries the corrected content when publication already occurred.
New approval creates a new notice. Old notice links remain unavailable and cannot restore removed content.

Only approved discussion summaries appear beside active notices. Owner withdrawal, correction, resolution, and retraction suppress derived discussion.
Withdrawal removes private narrative, source description, discussion text, and private historical messages from the sidecar.
Minimal action history remains. Existing domain withdrawal handles notices, graph evidence, and queued notifications.

## Checks

```sh
npm run check
npx vitest run tests/community-workflow
npx tsx tests/community-workflow/browser-server.ts
# In another terminal:
node tests/community-workflow/browser.mjs
```

The browser harness uses port 4198 and only fictional in-memory sessions.
It checks intake, draft retention, owner isolation, clarification, publication, moderated discussion, share links, correction, and withdrawal.
It checks 320, 390, and 1440 pixel layouts and writes screenshots under `.data/community-workflow/`.

Real account integration, staffed moderation, real external delivery, and production publication remain separate release gates.
