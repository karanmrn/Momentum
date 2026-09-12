# Historical police backfill

These files store internal evidence. They do not publish history or send alerts.

Run from the repository root:

```sh
node --import tsx scripts/backfill/cli.ts reviewed-area.json 2026-01 2026-06 /absolute/internal/output
```

The area file must satisfy `services/ingestion/src/police/geometry.ts`.
Unapproved geometry blocks before network access. Do not add approval fields without an actual boundary review.
The CLI requires all four arguments. It accepts at most 36 months per run.

Each scope has a separate directory, checkpoint, and exclusive lock.
The checkpoint stores discovered months, metadata retrieval time, checksum, and source URL.
Refresh clears prior discovery metadata before the network request. Failed discovery cannot retain a current metadata claim.
Each month stores a full response. Duplicate records remain in that response.
An unchanged source and taxonomy checksum preserves the existing snapshot file.
A changed checksum replaces the current snapshot atomically.
Each successful response also retains a revision under `revisions/<month>/<checksum>-<taxonomyChecksum>.json`.
Revision files use mode 600. Revision directories use mode 700.
Validated fresh evidence repairs corrupt archived copies.
The reader uses only the current checkpoint and snapshot. It never adds archived records to counts.
Revision archives remain internal and cannot trigger automatic publication.
A refresh marks requested months unavailable before source discovery starts.
A failed or missing refresh therefore hides older snapshots through `readBackfill`.
Rate limiting stops the batch immediately. Remaining requested months become unavailable.
The checkpoint preserves the bounded retry delay, up to 3600 seconds.
Wait for that delay before a manual rerun. The runner does not sleep or retry automatically.
Run the same command again to recover interrupted or failed requests.

Files use mode 600. Scope directories use mode 700.
After a process crash, confirm no import or reader remains active before removing its `.lock` file.
Never place the output directory in a public static directory.

## Integration

`runBackfill({area, months, outputDir, client})` returns the latest checkpoint.
`readBackfill(outputDir, area, months)` returns validated `MonthResult[]` for the aggregate service.
Readers hold the same exclusive scope lock. A busy or invalid store returns unavailable.
Snapshots must match the checkpoint checksum, requested month, and reviewed area scope.
The reader also verifies the parsed records checksum and the source URL date and polygon.
A corrupt prior snapshot is replaced from validated fresh evidence, even when its source checksum is unchanged.
The source checksum represents original response bytes. It is not a hash of the parsed snapshot JSON.

The coordinator owns `/api/history`. This change does not add that route or database tables.
Use approved geometry and the checkpoint reader when connecting the history service.
Retain missing and unavailable results. Never turn them into zero counts.

Tests use synthetic fixtures and mocked clients. No live crime import has run.
