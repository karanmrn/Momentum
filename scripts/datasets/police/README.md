# Police research collection

Run `npx tsx scripts/datasets/police/collect.ts` from the repository root.

The collector reads all available reporting months from Police.uk.
It then requests each month for three source-defined, one-mile circles.
These circles use project anchors. They are not approved pilot boundaries.
All outputs remain research-only. Publication and alerts remain disabled.

Raw JSON files and per-request manifests are stored under `.data/datasets/police/`.
Files use mode `0600`. New directories use mode `0700`.
The repository ignores `.data/`.
A sanitized acquisition manifest is written to `research/datasets/police-status.json`.
It lists downloaded months and source coverage. It excludes record counts and outcome counts.
Local manifests retain acquisition counts. These are not approved pilot totals.

Each request manifest records the source URL, month, retrieval time, SHA256, record count, and outcome counts.
It also records BTP provenance, missing persistent IDs, and the source-circle definition.
Raw bytes preserve all upstream fields and repeated records.
Runtime validation checks coordinates, categories, and the requested month.
Reporting-month availability does not prove complete force coverage.
An empty response only establishes that the request returned no records.

Requests run serially with at least 150 milliseconds between requests.
Each request has a 15-second deadline and a bounded response size.
One transient failure is retried after two seconds.
HTTP 429 halts all remaining requests and records Retry-After.
The collector does not follow redirects.

Completed scopes resume from files whose checksum, source URL, month, and records pass validation.
Reruns reuse these immutable downloads. They do not refresh source revisions automatically.
Use a separate output root through the exported `collect` function for a later acquisition snapshot.
Failed scopes are listed explicitly and can resume on the next run.
