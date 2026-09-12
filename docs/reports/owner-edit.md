# Owner report correction

The plan requires owner corrections at `generalist.md`, section 12, `PATCH /api/reports/:id`.
Before this change, `server/routes.ts` accepted withdrawal only. The new HTTP test reproduced a 400 response to an edit.

## Contract

The client calls `api.editReport(id, expectedRevision, changes)`.
The endpoint accepts:

```ts
{
  action: 'edit';
  expectedRevision: number;
  changes: {
    category: Category;
    title: string;
    description: string;
    place: string;
    observedAt: string;
    synthetic: true;
  };
}
```

All change fields are required. Limits match report creation.
The pilot, ID, owner, creation date, status, and notice ID cannot change.
Both outer and nested input objects reject unknown fields.

Only the owner can edit a submitted report with no public notice.
Edits keep the report private and increment its revision.
The moderator sees the changed content. An older review decision returns 409.
Creation-key retries return the current report and cannot restore the replaced narrative.
Previous raw narrative text is not retained as an edit history.
Existing withdrawal still redacts reports and their cached outcomes after review.

| Status | Meaning |
| --- | --- |
| 200 | Report saved; use its returned revision |
| 400 | Invalid fields, protected fields, or unsafe demo text |
| 403 | Moderator attempted an owner action |
| 404 | Report is absent or belongs to another owner or browser session |
| 409 | Revision changed, or report was reviewed, rejected, or withdrawn |

On 409, keep the unsaved form values and offer a refresh.
Do not silently retry with a newer revision or publish the correction.
The owner-edit action has no separate idempotency key; repeated saves with an old revision return 409.

## Verification

`tests/http/report-edit.test.ts` exercises the actual HTTP application and its PGlite store.
It covers ownership, session isolation, concurrent edits, stale moderation, public graph isolation, and terminal states.
It also checks immutable fields, bounded text, and stale creation-key replay.

The UI task owns editor controls and browser verification. This backend commit does not change `src/main.tsx`.
Real public intake, Supabase ownership, and production database changes are outside this fictional workflow.
