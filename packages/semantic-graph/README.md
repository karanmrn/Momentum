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

## Dated enrichment projection

`enrichment.ts` projects validated source artifacts with `enrichment-projection/1` qualifications.
The public graph includes the latest acquired MPS month for each pilot's containing borough.
The seven source categories stay separate. Missing values stay null.
These counts are not pilot totals or independent confirmation of Police.uk records.

Verified ONS observations retain whole statistical-area population and Census dates.
The research anchor relation does not approve the pilot boundary or provide a crime-rate denominator.
LSOA and MSOA populations overlap and must not be added.

Camden outcomes join the selected police records by exact persistent ID, category, and recorded month.
Outcome month is not an exact transition date. No person identity enters this projection.
Immutable snapshot hashes identify the source versions. A rebuild selects the current imported artifact.
The model does not claim a retained revision archive or an automatic source-refresh service.

`AvailabilityAssertion` nodes separate directory schedules from current operation.
Their versioned assertions retain source time, precision, visibility, and unknown independence.
Availability stays unknown or unconfirmed. These assertions cannot trigger alerts.
No operator feed or general asset inventory is fabricated.

Graphify exports preserve these qualified assertions. Runtime validation rejects changed source counts, joins, hashes, or qualifications.
Broad enrichment is omitted from notice-scoped graph requests. Existing graph limits still apply.
Police priorities remain gated because the acquisition manifest does not permit publication.
