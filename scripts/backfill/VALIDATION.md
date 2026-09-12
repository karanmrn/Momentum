# Historical ingestion validation

## Scope

This component implements the historical Police.uk workstream from `prompts/02-historical-police-data.md`.
It does not change shared contracts, application routes, migrations, manifests, or user interface files.
The integration task owns those paths.

## Live evidence

The actual client fetched publication metadata and the July 2026 taxonomy on 12 September 2026.
The source returned 36 reporting months and 15 taxonomy entries.
The latest month was July 2026.
`scripts/backfill/live-probe.json` stores the exact metadata, source URLs, retrieval times, and response checksums.
Taxonomy entries include the API's all-crime selector. They are not 15 independent measured offence groups.
No live crime records were imported by this component.
All three reviewed project polygons remain absent from `config/pilot_areas.json`.

## Integration boundary

Use `createPoliceClient()` from `services/ingestion/src/police/client.ts` for official API calls.
Use `runBackfill()` and `readBackfill()` from `scripts/backfill/index.ts` for internal snapshot storage.
Use `summarizeHistory()` from `packages/history/src/index.ts` for internal monthly counts.
Pass only the latest reader results to the summary function.
Do not concatenate snapshots from repeated imports.

The approved input is local to this module. It does not replace the shared pilot configuration.
The geography owner must provide these fields after actual review:

- `pilotId`: one of the three existing pilot IDs.
- `boundaryVersion`: the reviewed geometry version.
- `boundaryStatus`: `approved`.
- `reviewedBy` and `reviewedAt`: actual review provenance.
- `crs`: `EPSG:4326`.
- `geometry`: a closed GeoJSON Polygon with one exterior ring.

Convert the canonical configuration only after its boundary fields have been completed and approved.
Do not copy the synthetic test polygons into project configuration.
The module rejects holes, self-intersections, excessive query sizes, and geometry outside the selected pilot vicinity.
It includes boundary points deterministically. Police coordinates remain approximate.

The coordinator should retain the existing unavailable history route until its publication requirements pass.
Internal summaries always set `publicationAllowed=false`, `alertEligible=false`, and `visibility=internal`.
Public disclosure and suppression rules are not implemented here.
No individual event confirmation, correlation estimate, sexual-only category reconstruction, or current warning is produced.
MPS import is optional and deferred. It must not be added to overlapping Police.uk counts.
Local snapshots are not a production database or a database migration.
The server must not serve the output directory as static files.

## Actual checks

Run the scoped suite:

```sh
node_modules/.bin/vitest run tests/history
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler services/ingestion/src/police/*.ts packages/history/src/*.ts scripts/backfill/*.ts tests/history/*.ts
```

The scoped suite passed 43 tests across four files.
The explicit scoped TypeScript command passed.
Final independent review found no remaining P1 or P2 defects.
The CLI rejected the current unapproved configuration with exit code 1 before creating an output directory.
Tests use explicitly synthetic geometry and records.
They exercise transport, runtime schemas, saved-file integrity, source revisions, missing data, geometry, and aggregate behavior.
The synthetic end-to-end test passes HTTP responses through import, disk storage, reload, and summary calculation.
No browser test is required for this component because it adds no page or route.

## Operational limits

Each batch accepts at most 36 distinct months and uses serial requests.
Each street response accepts at most 10,000 records and 10 MiB.
Metadata responses accept at most 128 KiB.
Every request has an eight-second deadline and rejects redirects.
HTTP 429 stops the batch. Wait for its saved retry delay before another run.
HTTP 503, invalid responses, and oversized requests remain unavailable.
The component does not split polygons or retry automatically.
A completed empty response means zero returned records for that query, not complete crime coverage or an all-clear state.
A reporting month in global metadata does not prove that each force supplied complete data.

After a process crash, inspect active processes before removing a stale scope lock.
Normal exits remove the lock. Readers refuse to inspect a scope during an import.
The metadata probe does not exercise a real approved-area backfill.
