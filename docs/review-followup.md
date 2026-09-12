# Code and module review

Reviewed on 12 September 2026 from `4b1cbc2`.
The follow-up includes release changes through `e948a45`.

Three subagents reviewed core logic, acquisition modules, and code and copy cleanup.
The parent reviewed client response handling and ran browser verification.
The review used codebase-design, code-reviewer, no-ai-slop, and deslop.
Previously resolved findings are recorded in `docs/release-review.md`.

## Fixed findings

| Priority | Trigger and failure | Fix and evidence |
| --- | --- | --- |
| P2 | A successful dataset response contained HTML. The client returned `undefined`, and the page became blank. | Reject malformed response envelopes. A browser test checks unavailable state and successful retry. |
| P2 | NaPTAN refresh failed after an earlier successful acquisition. Coverage still showed the old acquired status. | Invalidate the status before refresh. A mocked HTTP 503 test checks collector-to-projection behavior. |
| P2 | Browser tests used a different port. The research subprocess still connected to port 4174. | Pass the configured browser address to the subprocess. Verify the suite on port 4287. |

## Cleanup

Removed duplicate notice validation and a conditional whose branches returned the same summary.
Replaced thirteen `any` annotations in malformed-fixture tests with typed transformations.
Removed a stale deployment statement and clarified which routes require authentication.
Changed an error test to require rejection, so unexpected success cannot pass silently.

No-AI-slop checks passed for the edited README.
The edit preserves concrete setup steps, source limits, and privacy labels.

## Module design

| Module | Interface and Seam | Assessment |
| --- | --- | --- |
| Client requests | Callers request domain data and receive a result or `ApiError`. | Response-envelope checks now remain inside this Module. Callers use their existing error states. |
| Transport collector | `collect(root)` owns acquisition files and status publication. | The Implementation now invalidates coverage before external work. Callers need no extra failure-cleanup step. |
| Demonstration Store | Reads and transactions cross one Interface. | PGlite and Postgres provide real Adapters. Keep this Seam and its transaction tests. |
| Historical acquisition | The Interface validates geography, source records, and reporting periods before projection. | Keep validation close to acquisition and summary construction. No new wrapper is needed. |
| Notice transitions | Public actions coordinate revisions, graph visibility, and inbox corrections. | Removing repeated private validation simplifies the Implementation without widening its Interface. |

Public and invited source routes duplicate some cache and error handling.
Their current behaviors differ, so extracting a shared Module would require a separate behavior decision.
OSM query constants also appear in acquisition and projection. No related defect was found.
Neither observation justifies a broad rewrite in this cleanup.

## Verification and limits

- Full automated suite: 286 tests passed across 35 files.
- Production build: passed.
- Native Node startup and three public dataset routes: passed.
- Browser suite: all thirteen journeys passed on port 4287.
- Browser verification uses an isolated local database and mocked source failures.

The client checks envelope shape, not every nested field of each domain response.
No paid source calls, raw personal-data imports, or deployment changes were made by this task.
