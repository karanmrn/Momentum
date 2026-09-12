# Momentum relation review

This module supports fictional moderator review for the three existing pilot areas.
It does not accept police rows, real reports, or arbitrary source objects.
Public intake and external notifications remain outside this module.

## Integration

Add this optional field to `DemoState` with a type-only import:

```ts
relationReview?: import("../relation-review/schema.js").RelationReviewState;
```

Mount `createRelationReviewRoutes(store)` at `/api/relation-review` after verified session middleware.
The router requires a valid session identifier and the `moderator` persona before every read or write.
Existing `Store.mutate` provides session RLS, transaction rollback, and row locking.
Do not mount these routes through a public or privileged service-role proxy.

Render `RelationReview` from `src/RelationReview.tsx`. The component accepts an optional `onExit` callback.
It reads the existing session persona and provides the existing deliberate demo-persona switch.
This switch cannot authorize a real moderator account.

## Routes

All mutations use POST, JSON, `Idempotency-Key`, `area`, and `expectedRevision`.
Unknown fields are rejected. Each operation validates its area and report membership.

- `GET /?area=camden_town` returns the scoped private queue, current report details, groups, and history.
- `POST /examples` adds four explicitly fictional reports once per area.
- `POST /generate` generates bounded candidates from current fictional reports.
- `POST /candidates/:id/decision` accepts `approve`, `reject`, or `retract`, with a reason.
- `POST /clusters/merge` accepts report IDs and a reason.
- `POST /clusters/:id/split` accepts complete, disjoint report partitions and a reason.
- `POST /events/:id/undo` reverses the latest group change for that area.

## Candidate limits

Generation examines at most 40 current reports and adds at most 40 candidate pairs per command.
The session stores at most 100 candidates and 150 command fingerprints. Creation keys are never evicted.
It stores at most 30 groups, 100 group events, and 150 review decisions.
Replay returns the current scoped view without repeating a mutation.
A stale revision or changed command fingerprint fails without overwriting saved state.

Normal report places remain approximate. Point timestamps use a one-hour candidate window, without claiming interval overlap.
Only the labelled demonstration fixtures supply fictional asset references and reported intervals.
Edited fixture content loses that qualification until separately supported data exists.
Shared source origins cannot receive operational approval. Different usernames do not establish independent sources.
The module never reports an independence percentage or proves that an incident occurred.

## Review lifecycle

Candidates retain source families, origin lineage, precision, intervals, report revisions, reasons, and method versions.
Operational approval requires an allowed category, matching fictional assets, and overlapping reported intervals.
The decision ledger preserves approval, rejection, and retraction reasons separately from the current candidate status.
Review groups do not add pairwise assertions. A similar to B and B similar to C never establishes A equals C.
Splits preserve every member once. Undo restores grouping metadata without restoring reports or relation decisions.

Every read and public projection rechecks the underlying report revisions and current publication state.
Changed, rejected, or withdrawn reports immediately make previous candidates invalid.
Read-time invalidation leaves `retiredAt` unknown until a later successful mutation records the detection time.
No false detection timestamp is invented on each read.
Cluster history retains only private report references and reasons. It never copies report narratives.

## Public graph adapter

`approvedOperationalRelations(state, pilotId)` returns only approved relations whose two notices remain active.
The helper excludes private report IDs, candidate IDs, clusters, account identifiers, and review reasons.
Report changes invalidate its output immediately. Both notices must already have approved public summaries.
Publication changes the report revision, so regenerate and review its new candidate before exposing the relation.

Each returned item has this shape:

```ts
{
  id: "operational:<stable hash of public notice revision IDs>",
  subjectId: "notice:<public UUID>:revision:<number>",
  objectId: "notice:<public UUID>:revision:<number>",
  predicate: "SAME_OPERATIONAL_ISSUE_AS",
  evidenceRefs: [subjectId, objectId],
  inferenceType: "human_review",
  methodVersion: "fictional-relations/1",
  reasonCodes: ["reviewed_same_fictional_asset_and_interval", "not_incident_confirmation", "independence_unknown"],
  synthetic: true,
  qualification: {
    reviewedAt: "<ISO timestamp>",
    sourceFamilyIds: ["<source family>", "<source family>"],
    independence: "unknown",
    validFrom: "<overlap start>",
    validTo: "<overlap end>"
  }
}
```

The coordinator must extend the semantic schema and SQL predicate constraint for `PublishedNotice -> PublishedNotice`.
Insert only when both endpoint nodes exist in the bounded projection. Preserve the qualification and synthetic flag.
Never add candidates or group memberships to public exports.

## Validation

- `npm run check`
- `npx vitest run tests/relation-review`
- `node --import tsx tests/relation-review/browser.mjs`

The HTTP and browser harnesses use isolated in-memory PGlite and explicit test authentication fixtures.
They do not verify real account roles, hosted deployment, or production credentials.
The browser journey covers generation, inspection, approval, merge, split, and undo at 320 and 1280 pixels.
