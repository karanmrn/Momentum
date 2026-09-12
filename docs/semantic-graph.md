# Semantic graph implementation

The application stores a derived evidence graph in PostgreSQL. PGlite runs the same schema during local development.
The source records remain authoritative. Graph tables hold replaceable projections, not a second record system.

## Ontology and access

`packages/semantic-graph/schema.ts` defines the runtime schema and allowed node and relation pairs.
Nodes represent areas, approximate places, sources, reviewed notices, and acquired dataset coverage.
Each assertion retains its method, evidence references, reason codes, and synthetic status.
Source family and original claim lineage remain separate.

`GET /api/public/graph?area=camden_town` returns public acquisition metadata without a session.
`GET /api/graph?area=camden_town` adds current fictional notices from the caller's isolated demo session.
Requests require one configured area. Extra parameters cannot change the fixed projection. Writes are rejected.
Each result contains at most 100 nodes and 200 assertions. Truncation is explicit.

Police nodes describe acquired monthly source files. Unreviewed research boundaries prevent publication of pilot crime counts.
The contextual relation means a shared research area. It cannot confirm an individual report.
Public mode contains no real community reports. Account creation does not change that publication gate.

## Storage and correction

Apply `001_demo_sessions.sql`, then `002_semantic_graph.sql`, to a dedicated demonstration database.
Local startup applies both files automatically. Hosted startup does not apply migrations.
No production migration was performed during this implementation.

The three derived tables contain snapshot metadata, typed nodes, and qualified assertions.
Composite foreign keys enforce the same session and pilot for assertion endpoints.
Forced row-level security checks the server's session scope and its expiry.
The browser never receives database administrator access or direct write permission.

Graph reads lock the authoritative session row, build the three pilot projections, replace the stored rows, and read the selected graph.
State mutations invalidate all session projections before commit. The next graph read rebuilds current relations.
Transaction failure rolls back both state and projection changes. Session expiry hides graph rows; deletion cascades to them.
Real account reports will require their own ownership schema before intake can open.

## Graphify assessment

[Graphify](https://github.com/Graphify-Labs/graphify) supports offline code and document graph exploration.
It is optional analysis tooling. It does not replace the application's authorization and correction rules.
The assessment checked the repository's `v8` branch at `23f2ffaa43fd12f25d9eabe91e6d184b5d89b474`.

Its simple graph structure can collapse parallel assertions. Its export also assigns numerical confidence defaults.
Those defaults must never become evidence confidence or harm probabilities.
If an export is added, each qualified assertion needs its own node and directed links to its endpoints.
Exports would also need withdrawal invalidation and access limits. No Graphify extraction or external model call was run here.

## Verification

`tests/semantic-graph` checks ontology validation, current publication, provenance, bounds, and withdrawal.
`tests/semantic-store` runs PostgreSQL isolation, expiry, rollback, correction, and foreign-key checks under a restricted role.
`tests/http/semantic.test.ts` verifies public and session-scoped application routes.
`tests/e2e/semantic.spec.ts` checks browser recovery, source inspection, and a narrow layout.
