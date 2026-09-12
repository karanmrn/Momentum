# Private dataset storage

Real source records use `research.dataset_artifacts` and `research.dataset_records`.
Apply `supabase/migrations/20260912143718_private_research_datasets.sql` before import.
The migration does not grant access to browser roles or the demo app.

Each artifact records its source path, SHA-256 hash, byte count, row count, and source manifest.
Each record retains source identifiers, retrieval time, observation time, and the original JSON payload.
Observation time remains text because some sources supply only a month.

The importer commits each artifact in one transaction.
It validates file hashes and record counts before commit.
An identical, complete artifact can be imported again without duplicate rows.
Partial or changed artifacts fail validation.

Police locations are approximate. Police records describe historical context.
Police priorities describe police statements. They are not independent community reports.
ONS observations retain their source year and statistical geography.
Transport snapshots retain their retrieval time.
All stored records prohibit publication and alerts.

These tables do not feed the public graph automatically.
The public application keeps its fictional demo records in separate session tables.
No independent community dataset was acquired in this import.

Use a dedicated database login for ingestion.
Grant access only to these two research tables through explicit RLS policies.
Keep its connection string in a server environment or a private environment file.
Do not place database passwords in commands, browser code, logs, or Git.

Provisioning status must record actual remote results separately.
Local validation does not prove that a hosted project exists.

## Verified local import

On 12 September 2026, a persistent local PGlite database stored 28 artifacts and 134,538 records.
A second import preserved these counts and skipped all 28 complete artifacts.

| Source | Stored rows |
| --- | ---: |
| Historical police | 134,305 |
| OpenStreetMap | 160 |
| TfL selected objects | 34 |
| TfL raw snapshots | 12 |
| NaPTAN selected stops | 12 |
| ONS population observations | 6 |
| Police priority pairs | 9 |

Police rows cover 108 area-month scopes from August 2023 through July 2026.
The areas use source-defined one-mile research circles, not reviewed application boundaries.
TfL line objects and raw snapshots retain shared scope through their source manifests.
Six manifest artifacts contain provenance without record rows.

The private database is in `.data/research-db` in the provisioning worktree.
The import report is `.data/provisioning/local-import-report.json`.
Neither path belongs in Git or a public deployment.
This result does not establish hosted storage or a live community dataset.
