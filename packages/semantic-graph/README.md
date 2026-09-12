# Semantic graph

`projectSemanticGraph(state, pilotId, datasets, noticeId?)` rebuilds evidence from current public domain records and dataset coverage.
Pass `null` for state on public routes. Pass `getDatasetCoverage(pilotId)` for datasets.
An optional notice ID restricts community evidence to that current notice.

The module preserves the domain withdrawal and retraction rules. It stores no independent copy of reports or graph state.
Each assertion identifies its method, public evidence references, reason codes and synthetic status.
Nodes preserve source family, origin lineage and retrieval time where the source provides them.

Police nodes describe acquired monthly files. They contain no incident counts or individual police records.
Context assertions indicate a shared research area. They do not establish a matching event, correlation or independent corroboration.
Unavailable coverage produces an explicit blocked state without contextual links.
Community nodes remain fictional until the domain supports approved real publication.

The runtime schema permits five node types and four predicates. It rejects invalid node pairs and missing references.
Projections contain at most 100 nodes and 200 assertions. `truncated` indicates omitted public records.
Private reports, account identities, preferences and follower counts never enter the projection.

Run `npx vitest run tests/semantic-graph` to check adapters, source lineage, withdrawal, privacy and bounds.
