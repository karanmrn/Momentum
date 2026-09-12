# Evidence knowledge graph specification

## 1. Purpose

Answer: what has been reported; about which place/asset; by which type of source; for which time interval; with what provenance and limitations; how another record is related; and why the published notice is relevant to a consenting user. Do not answer: who is a criminal, which person will offend, or which street is guaranteed safe.

The logical graph is a graph even when stored in relational tables. Begin in Postgres/PostGIS, with typed nodes and qualified assertion rows. W3C PROV-O [K01] informs lineage, not an obligation to deploy RDF, Neo4j and a vector database. A later read-only graph projection must preserve access control, deletion, version and source semantics; do not dual-write two authoritative stores.

## 2. Node types

| Type | Example | Default visibility |
|---|---|---|
| Area | reviewed custom Camden Town polygon | public |
| Place | station, entrance, path segment, approved coarse cell | public |
| Asset | mapped lamp, accessibility facility | public only with permitted source |
| Source | operator, council, dataset or consented contribution system | public metadata |
| SourceSnapshot | a versioned permitted response/document | internal; public excerpts only if permitted |
| Observation | one source's statement about an issue | private until publication review |
| IncidentCluster | a working group of potentially related observations | analyst/moderator; not proof of a single crime |
| PublishedNotice | approved summary and current revision | public or pilot-limited |
| HelpLocation | registered scheme place and distinct availability assertions | public |
| HistoricalAggregate | category × approved region × period × source | public subject to disclosure policy |
| AnalysisRun | frozen method, inputs, diagnostics and result | analyst, reviewed public summaries later |
| Transformation | importer, parser, reviewer action, or mapping version | internal metadata |
| UserPreference | explicitly chosen interests and delivery settings | owner only, separate private schema |

No alleged-offender, witness-identity or victim-identity nodes in the public/shared graph. Store the minimum account identifier separately; submissions reference the owner only in private application tables. Organisation identity can be public when appropriate; that is not permission to name private individuals.

## 3. Allowed edge/assertion types

`WITHIN_AREA`, `LOCATED_AT`, `AFFECTS_PLACE`, `DESCRIBES_ASSET`, `ISSUED_BY`, `DERIVED_FROM`, `EXTRACTED_BY`, `HAS_SOURCE_REVISION`, `SUPERSEDES`, `RETRACTS`, `POSSIBLE_DUPLICATE_OF`, `MEMBER_OF_REVIEW_CLUSTER`, `CONTRADICTS`, `SAME_OPERATIONAL_ISSUE_AS`, `CONTEXTUAL_HISTORY_FOR`, `ANALYSIS_ASSOCIATION`, `HELP_NEAR_PLACE`.

`FOLLOWS_PLACE` and `RELEVANT_TO_USER` belong to the owner's private projection. They must never be traversed from a public place or notice to enumerate followers.

**Prohibited predicates:** `COMMITTED_BY`, `SAME_OFFENDER_AS`, `CRIMINAL_ASSOCIATE_OF`, `CONFIRMS_CRIME` derived from monthly proximity, `SAFE_FOR_PERSON`, or an unrestricted `SAME_AS` for approximate event matching.

### Publisher family versus original claim lineage

Keep `sourceFamilyId` (related publishers/datasets/measurement pipelines) distinct from `originGroupId` (the originating claim and its copies). A publisher can carry many independent events; membership of one dataset family never deduplicates them all. Different domains can copy one original claim. Unknown origin means unknown independence, not automatic independent corroboration. Stable source-record identity is a third, separate concept. Pairwise corroboration decisions should record exactly which lineage evidence was available.

## 4. Qualified assertion record

Each assertion carries: UUID; subject/object IDs; enumerated predicate; explicit evidence refs; source family; inference type (`source_statement`, `deterministic_join`, `human_review`, `candidate_similarity`, `statistical_analysis`); method/version; reason codes; valid-time interval; system/transaction-time interval; precision labels; visibility; publication status; reviewer role/id where required; and supersession/retraction pointers.

Evidence dimensions remain separate: source authority for the subject matter, geographic precision, temporal precision, source independence, publication review, data coverage and freshness. An official press release proves what its issuer stated, not that every allegation it describes is adjudicated fact. A moderation decision proves publication review, not a crime finding.

Optional internal candidate rank is explicitly **not a probability**. No universal confidence percentage appears to users. Prefer reason vectors such as `same_asset_id`, `overlapping_reported_interval`, `compatible_category`, `shared_original_source`, `police_month_only`, `precision_inadequate`.

## 5. Relationship decision table

| Proposed relationship | Evidence needed | Automatic result allowed |
|---|---|---|
| Same source record | exact source namespace + stable record ID | link versions, preserve changes |
| Same physical place | authoritative place ID or reviewed spatial mapping | deterministic place relation with precision |
| Duplicate import | same source request scope/version and stable content lineage | idempotent import; not erase legitimate events |
| Possible duplicate community report | compatible category, uncertainty-aware location and interval overlap | private review candidate, never auto truth upgrade |
| Same lamp fault | stable lamp ID plus compatible issue interval; distinct source lineage | candidate; approved operational link when supported |
| Same specific operator notice | explicit notice identifier/reference | source revision relation |
| Community report and monthly police record nearby | approximate cell/month/category compatibility only | contextual link only; individual event verification unsupported |
| Similar movements in two series | common measurement units and valid analysis protocol | analysis result with limitations, never event confirmation |
| Two syndicated posts repeating a claim | shared root source | one evidence family, not two independent witnesses |

Unknown precision does not become zero metres. Intervals that overlap do not prove exact contemporaneity. Do not snap police anonymised points to the nearest lamp, home, venue, station exit or CCTV camera and call that event location. Spatial matches are contextual unless source precision supports more.

## 6. Candidate generation procedure

1. Enforce caller access before retrieving candidates.
2. Restrict by allowed pair of source types and relationship types.
3. Block on reviewed region, compatible category and broad interval overlap; use source-specific precision rules.
4. Exclude mirrored/reposted source lineage from independent corroboration counts.
5. Generate bounded candidate pairs. For public monthly crime records, stop at contextual relations.
6. Calculate explainable feature/reason vectors for moderator ordering. Missing fields yield unknown features, not a favourable zero distance.
7. Store candidates and method version; show reviewer source details and contradictions.
8. Only an authorised reviewer can promote an allowed operational relation. Never promote to alleged shared offender.
9. Carry cluster split/merge history and undo operations. Candidate relations are not transitive identity: A resembles B and B resembles C does not prove A is C.
10. Retraction/invalidation cascades to derived cards and pending notifications. Immutable audit metadata may remain under retention policy; sensitive text is not retained forever in the name of provenance.

## 7. User-facing explanation card

A fictional Camden example:

- Reviewed community observation: a reported lighting issue at an approved coarse location.
- Council asset record: a mapped light exists; operational condition not established.
- Historical data: category counts for the area and stated months, not evidence of this observation.
- Relationship: shared area / possibly the same asset, subject to review.
- Unknown: whether the light is faulty now; whether any police record describes the reported situation.
- Why shown: you follow this area and selected infrastructure notices.

The normal interface is an evidence card and timeline, not a giant force-directed graph. Offer a bounded graph inspector for moderators and the demonstration, plus equivalent accessible text.

## 8. SQL storage contract

Use `graph_nodes(id,type,source_key,visibility,area_id,version)` plus `graph_assertions(...)`. Typed domain tables hold notice, asset, aggregate and observation fields. Foreign keys and allowed-predicate constraints validate node pairs. Geometry lives in PostGIS with SRID 4326; metric computations use an appropriate geography/projected calculation, not raw degree differences. Store geometry precision independently.

Maintain GiST geometry indexes, source namespace keys, status/validity indexes and a source-family index. Use narrow indexed two-hop queries for request-time explanations, with a proposed maximum 100 visible nodes, server caps and parameterised query templates. The cap is an engineering budget, not a platform guarantee.

Use public materialised projections for approved nodes/edges only. A shared cache must never store owner-private relevance or raw reports. RLS must also hold on joins, RPCs, graph traversals, counts, vector indexes, exports and admin endpoints. Do not let a hidden node be inferred through neighbour count, path existence, error message or edge label.

## 9. Acceptance outcomes

A real graph implementation imports approved source records, materialises typed relations, provides inspectable evidence, enforces visibility, and updates after corrections. A diagram or fabricated list of nodes alone is not completion. Include positive and adversarial relationship fixtures: different events at one police map point, stale notice and fresh re-fetch, copied posts, two users' private follows, interval/precision uncertainty and retracted evidence.
