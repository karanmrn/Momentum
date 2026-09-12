# Semantic graph implementation

The application stores a derived evidence graph in PostgreSQL. PGlite runs the same schema during local development.
The source records remain authoritative. Graph tables hold replaceable projections, not a second record system.

## Ontology and access

`packages/semantic-graph/schema.ts` defines the runtime schema and allowed node and relation pairs.
Nodes represent areas, places, sources, reviewed notices, source snapshots, selected police records, help locations, and dataset coverage.
The Camden demonstration also contains predefined fictional observations and summaries. Real private submissions remain excluded.
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

Apply `001_demo_sessions.sql`, `002_semantic_graph.sql`, then `003_camden_graph.sql` to a dedicated demonstration database.
Local startup applies all three files automatically. Hosted startup does not apply migrations.
No production migration was performed during this implementation.

The three derived tables contain snapshot metadata, typed nodes, and qualified assertions.
Composite foreign keys enforce the same session and pilot for assertion endpoints.
Forced row-level security checks the server's session scope and its expiry.
The browser never receives database administrator access or direct write permission.

Graph reads lock the authoritative session row, build the three pilot projections, replace the stored rows, and read the selected graph.
State mutations invalidate all session projections before commit. The next graph read rebuilds current relations.
Transaction failure rolls back both state and projection changes. Session expiry hides graph rows; deletion cascades to them.
Real account reports will require their own ownership schema before intake can open.

## Graphify export

`GET /api/graph/export?area=camden_town` returns the current validated demonstration snapshot.
`GET /api/public/graph/export?area=camden_town` returns real public source context without a session.
Each assertion becomes a separate node with directed links. Parallel assertions retain their qualifications.
Exports exclude private reports, identities, and preferences. A downloaded snapshot cannot update or be recalled.
Export again after a correction or withdrawal. The API always rebuilds from current session state.

`scripts/graphify-export.py` imports this structured graph into Graphify 0.9.58 for clustering and topology analysis.
It generates `graph.json`, `graph.html`, and `GRAPH_REPORT.md` in the chosen output folder.
It uses the existing domain records directly. Code extraction would describe implementation files instead of Camden evidence.
No model call or extraction token is needed. The exporter preserves source metadata without adding numeric confidence defaults.
Graphify does not replace the existing PostgreSQL store, authorization, or correction rules.

```sh
uv tool run --from graphifyy==0.9.58 python scripts/graphify-export.py input.json graphify-out
```

Save `input.json` from the Graphify download action. Do not export arbitrary internal state.

## Verification

`tests/semantic-graph` checks ontology validation, current publication, provenance, bounds, and withdrawal.
`tests/semantic-store` runs PostgreSQL isolation, expiry, rollback, correction, and foreign-key checks under a restricted role.
`tests/http/semantic.test.ts` verifies public and session-scoped application routes.
`tests/e2e/semantic.spec.ts` checks browser recovery, source inspection, and a narrow layout.
