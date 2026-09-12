# Recruitment demonstration

The user approved fictional submissions on 12 September 2026.
The two supplied documents define research requirements, not access permission.

## Document coverage

| Document requirement | Demonstration behavior |
| --- | --- |
| Compare three starting locations | Show coverage for each pilot in a fixed order. |
| Test claims about crime and lived experience | Keep these claims unverified. Do not calculate a danger ranking. |
| Distinguish joining, requests, channels, legacy groups, and gateways | Show each access method separately from current availability. |
| Respect group eligibility | Show access conditions without collecting personal attributes. |
| Request administrator approval | Show permission as unavailable. Do not send requests. |
| Collect deliberate opt-in observations | Require participation consent and fictional content confirmation. |
| Collect approximate place, time, comfort factors, and behavior | Use bounded choices and coarse landmark options. |
| Preserve collection provenance | Retain the selected source and versioned consent in the active record. |
| Publish aggregate themes | Require separate aggregate consent and suppress small cohorts. |
| Permit withdrawal | Remove observation content and exclude it from coverage. |

## Boundaries

Directory examples are fictional. They do not confirm access to any real community.
Private invitation links, personal contacts, and document extracts are excluded from public Git.
Channels provide broadcasts. Gateways do not establish that a WhatsApp group exists.
Legacy access remains unverified.

The browser keeps this exercise in memory only.
Leaving the view, switching personas, or reloading clears its state.
The interface explains this limit before submission.
The module does not send observations to a server or external service.
It does not add reports to the public graph or notification queue.

Real intake requires a separate approved implementation with authentication, storage, moderation, and consent operations.
The current demonstration must not be described as a live recruitment service.

## Ownership

This task owns `packages/recruitment/`, `tests/recruitment/`, and this directory.
The integration task owns application navigation, shared contracts, server code, and release tests.
The police data task owns historical ingestion and approved historical summaries.

## External verification

The optional external verification service has not run.
Local checks are reported separately.
