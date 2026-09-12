# Semantic graph

`projectSemanticGraph(state, pilotId, datasets, noticeId?)` rebuilds evidence from approved notices, dataset coverage, and Camden study records.
Pass `null` for state on public routes. Pass `getDatasetCoverage(pilotId)` for datasets.
An optional notice ID restricts community evidence to that current notice and excludes the separate case study.

All supplied dataset families retain their acquisition status, source, period, and geographic limits.
Coverage nodes contain no incident totals. Missing community acquisition remains `not_collected`.
Only historical police coverage creates `CONTEXTUAL_HISTORY_FOR` relations.

The Camden area projection includes five real police rows from `packages/camden-evidence`.
Source snapshots, police rows, and published area context retain provenance and qualification.
The study footprint connects through `CONTEXTUAL_AREA_ONLY`. It is not an approved pilot boundary.
These rows form a selected research sample. They do not establish matches with fictional accounts.

Demo sessions also include the five predefined fictional observations and summaries.
`packages/camden-evidence/session.ts` validates their session state and checks expected revisions.
Corrections change only the selected fictional example. Withdrawal removes that example's fictional nodes and links.
Public routes omit all fictional study nodes. Private submitted reports never enter either graph.

The module stores no independent authoritative report state.
The database adapter stores its validated projection and invalidates it after mutations.
Existing notice withdrawal, resolution, and retraction rules remain effective.
Projections contain at most 100 nodes and 200 assertions. `truncated` indicates omitted public records.

`toGraphifyGraph` exports a directed interchange graph from the validated projection.
Each qualified assertion becomes a separate node between its subject and object.
This preserves parallel assertions, source qualifications, and stable identifiers.
The export contains no inferred confidence scores, private reports, user identities, or followers.
It does not run Graphify extraction or create another authoritative database.

Run `npx vitest run tests/semantic-graph tests/camden-evidence` for projection and session checks.
Run `npm run test:server` to check native server imports.

`localContextGraph` adds five curated Camden help listings and dated canonical TfL station identities.
It uses local records only. Help availability remains unconfirmed; station operation remains unknown.
The Safety Bus preserves the dated KOKO location exception. It receives no invented coordinates.
Directory coordinates identify listed places. Station identities do not establish exact entrances.
Other detailed acquired datasets remain coverage records until a reviewed source projection exists.
