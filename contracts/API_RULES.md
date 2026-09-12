# API implementation contract

The master document's route table is the authoritative endpoint list. This document clarifies cross-cutting semantics. The proposed TypeScript types are at `contracts/domain.ts`; implement them as runtime schemas in `packages/contracts/src` once thread 00 freezes the application structure.

## Ownership and authorisation

Derive actor identity and permissions from verified authentication/server role membership, never from request JSON fields such as `userId`, `moderator=true` or `sourceKind=official_operator`. Public feed/evidence endpoints query public projections only. Private objects return an indistinguishable safe not-found response when the caller has no access. Avoid graph paths/counts that reveal private existence.

Every mutation takes a bounded input schema and idempotency token where retries could duplicate work. Revision mutations require `expectedRevision`; conflict returns 409 without overwriting newer content. A moderator decision and publication/outbox changes happen in an appropriate transaction. Cross-area role constraints apply to observations and related graph candidates.

## Response/error envelope

All normal responses use the domain envelope and include actual coverage. Errors are `{schemaVersion:'1.0', error:{code,message}, requestId}` with no content, credentials, private IDs or raw upstream response. Codes include `invalid_input`, `unauthorised`, `not_found`, `conflict`, `feature_disabled`, `rate_limited`, `source_unavailable`, `insufficient_comparable_data` and `internal_error`. Analysis insufficiency is normally an explicit successful result state, not a 500.

Public projection cache keys include pilot, approved filter set, data/schema/projection version. Personalised/private endpoints use no-store and cannot share public caches. Source item updates invalidate relevant projections. The browser renders summaries as text, not trusted HTML.

## Bounded query rules

Only three configured pilot IDs; checked category enum; validated ISO month/time fields; reviewed geometry or canonical place IDs; bounded page sizes and cursor signed/validated as appropriate; maximum relation depth two and default max 100 visible nodes as a proposed budget. Limits may be tightened after measurement. No arbitrary bbox across London, arbitrary graph predicate, arbitrary date-slice reconstruction, SQL/Cypher or unvalidated remote URL.

## Publication and withdrawal

`POST /api/reports` writes a private submitted observation; no public notice is created until moderation. `PATCH /api/reports/:id` supports own revision/withdrawal and does not directly edit a moderator's approved public summary. Withdrawal triggers review or immediate safe removal according to policy, cancels pending publication and invalidates derived public content where necessary. A lawful minimal audit tombstone may remain without identifying narrative. User-facing copy must reflect what actually happened.

## Reporting handoff

The official-reporting route supplies a source link and optional locally editable factual summary. It never claims police receipt and never automates submission to police/council forms. External link/phone/SMS actions are user initiated. Opening an official page is not a completed crime report.

## Source adapter contract

Adapters produce `source registry ID`, `run ID`, `fetch status`, `snapshot scope/completeness`, `records`, `source versions`, `schema version`, `coverage`, `warnings` and `next checkpoint`. Empty records can mean zero only when source coverage/completeness permits that interpretation. No adapter can change its declared authority or publish arbitrary user HTML. Licensed/public-content snippets are separated from full raw bodies and private reports.

## Notification contract

An outbox row references immutable notice revision and intended recipient/channel, but dispatch rechecks current notice state, permission, subscription and validity. Unsubscribe after enqueue suppresses dispatch. A correction can supersede queued originals and target prior recipients under the approved correction policy. Do not imply exactly-once network delivery; use idempotency and a documented retry/duplicate strategy.
