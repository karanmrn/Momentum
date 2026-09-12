# Store acquired research datasets

This importer stores acquired records in the private `research` schema.
It does not fetch sources, apply migrations, or publish records.
It rejects synthetic data and publication-enabled payloads.

Validate the saved files before import:

```sh
node --import tsx scripts/datasets/store/cli.ts --source-root /path/to/dataset-repository
```

The source repository must contain `.data/datasets` and `research/datasets`.
The check reads every normalized police record with bounded memory.
It verifies file hashes, source scope, stable identities, and record counts.

Apply the research migration separately before storage.
Use a database login with access to the private research tables.
Set `RESEARCH_DATABASE_URL` through the process environment.
The connection requires TLS certificate validation.
Remove SSL query parameters from the connection URL. The importer sets certificate validation itself.
Do not place credentials in command arguments or source files.

```sh
node --import tsx scripts/datasets/store/cli.ts --source-root /path/to/dataset-repository --apply
```

Each artifact uses one transaction and parameterized batches.
Any invalid row, duplicate identity, changed file, or count mismatch rolls back that artifact.
An existing artifact is skipped only after its metadata, supplied records, and stored count match.
New file hashes create separate snapshots. Previous snapshots remain unchanged.

The stored collection includes normalized police records, OSM places, selected transport records, TfL request snapshots, census counts, and priority pairs.
Public acquisition manifests retain source limits and attribution.
Priority artifact manifests retain the source-asserted issue/action relations.
The importer excludes duplicate police monthly arrays and the national NaPTAN CSV.
It stores the selected NaPTAN records instead.

Police record identifiers preserve source multiplicity. They are not police case references.
Month and day strings keep their original time precision in `observed_at`.
Line snapshots retain whole-line scope. They are not current transport status after retrieval.
OSM places do not become reviewed help locations.

For local PostgreSQL-compatible verification, use the same functions with PGlite:

```ts
const artifacts = await buildImportPlan(sourceRepositoryRoot);
for (const artifact of artifacts) await importArtifact(database, artifact);
```

The database must implement `query(sql, values)` and return a `rows` array.
Import functions never create a schema or grant access.
