# Area graph explorer

Open Graph view from the website sidebar or top bar. Select Camden, Hounslow, or West Croydon.
The dedicated route is `/?workspace=graph&area=camden_town`.

The dark canvas uses entity colours and connection-count sizing. Neither represents personal danger.
Pan, zoom, fit, search, record filters, keyboard controls, and equivalent record lists are available.
Select a node or edge for provenance. Open Details and connections to compare two records.
Comparison follows up to four stored edges. Shared source or area context does not prove a shared incident or cause.
Source limits remain available below the graph.

## Source boundaries

The default route loads the public graph without a private session request.
Fictional reports require an explicit checkbox. Failed sessions do not become synthetic public data.
Area changes cancel prior requests. Invalid schemas, wrong-area payloads, and synthetic public payloads fail closed.

## Local dataset browser

Development builds include Browse all datasets. The current local import has 31 artifacts and 135,053 records.
Select a dataset and source month. Pages contain at most 30 records; page navigation can reach all area-assigned rows.
Unassigned source snapshots remain in the catalog but are not assigned to an area without evidence.

Set `GRAPH_RESEARCH_DB_PATH` to an existing research database directory when starting the local server.
The router opens the database lazily and uses read-only transactions with parameterised, bounded queries.
It rejects hosted environments, missing configuration, missing sessions, and non-loopback host names before database access.
The current local server listens on `127.0.0.1:4196`.

Record projections allow selected dataset fields only. Raw payloads and private report text are excluded.
`DatasetRecord` requires real provenance. Its area edge is `CONTEXTUAL_AREA_ONLY`, not a containment claim.
Source keys, source hashes, times, source precision, and original geography remain visible.
Blank coordinates remain absent. Whole-borough counts do not become town-centre counts.
Local exports retain `localResearchOnly: true` and `publicationAllowed: false`.

## Verification

- 23 model and research HTTP/SQL tests passed.
- 14 public/demo graph browser cases passed at 320, 390, and 1440 pixels.
- Two dataset browser regressions passed, including stale counts, failed requests, invalid cursors, and downloaded scope metadata.
- TypeScript and native ESM server checks passed.
- Independent visual checks passed at 390, 903, and 1440 pixels.
- Actual local catalog, record pages, month filters, node details, and pagination were checked.

These are scoped results. Combined release verification belongs to the integration task.
