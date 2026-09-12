# GENERALIST — Three-area community safety platform

## Hounslow town centre · Camden Town centre · West Croydon

**Prepared:** 12 September 2026, Europe/London.  
**Working product name:** STREETWISE — provisional, not a cleared brand.  
**Artifact status:** research-backed implementation plan, not a built/deployed application. Source pages and specifications were researched; crime records, approved boundaries, real correlations and deployed services have not been produced here.  
**User instruction:** build a community/user-led safety application that combines permitted public data, a knowledge graph, personal relevance, incident reporting and cross-source relationship analysis. Prepare independent Codex workstreams.

## 0. Read this first: decisions and precedence

This document supersedes the previous SAY IT mental-health concept and the single-West-End requirement in `generalist_safety.md` and `grok_review.md`. Do not rebuild their abandoned workflows or copy Westminster rankings into these pilots. Retain old files as archived research, not live competing requirements.

The selected areas are **Hounslow town centre, Camden Town centre and West Croydon**. Camden is interpreted as Camden Town centre rather than the entire borough; this is an explicit scoping assumption. Use one configurable platform with three reviewed local polygons, not three separate applications and not all of London. The town-centre boundaries are product geographies, not official statistical wards.

The product has five complementary capabilities:

1. Read current, source-labelled local/transport notices.
2. Find registered or partner-listed help locations, with availability uncertainty.
3. Submit an observation or incident account for private review and optional redacted publication.
4. See dated historical police-recorded context, separate from current reports.
5. Understand evidence relationships and receive relevant updates based on explicit preferences.

**Core engineering rule:** the graph stores what sources assert and how evidence is related. It does not convert claims into facts, approximate police points into exact crime scenes, correlation into causation, or multiple reports into guilt.

### What Codex must deliver

Build an actual application, populated graph relations, API contracts, ingestion jobs, private moderation, personal watchlists, correction-aware notifications, tests and deployment configuration. A landing page, a force-directed diagram, a plan-only response, or unrelated mock screens are not completion. Where an integration is genuinely blocked by credentials, permissions or unavailable data, implement a clearly labelled adapter/test fixture and mark the connector blocked. Never fabricate a successful live response.

Work in phases. An end-to-end synthetic demonstration can be completed before real public intake passes governance gates. The code for a gated feature should be implemented and tested even when its public flag remains disabled.

## 1. Product proposition and success

> A community-informed local safety companion that connects current notices, places to seek help, reviewed observations and historical patterns—and explains why each piece of information is relevant to you.

The first user scenario is someone walking from an evening activity or shift to a local station. The women’s-safety focus informs discovery and testing, but access to public information should not require gender disclosure. Additional useful personas are a commuter with accessibility preferences, a local resident reporting an infrastructure problem, and a moderator/partner keeping notices current.

The primary outcome to test is **better-informed action**, not increased fear, more reports or time spent in the app. Can the person distinguish current from historical information, identify an unresolved issue, locate appropriate help, understand the source and see a correction? Do not claim reduced crime or prevented violence from task-completion results.

Proposed SDG alignment: SDG 11.7, safe and inclusive public spaces, and SDG 5.2, violence against women and girls. SDG 3 is a secondary wellbeing rationale, not a reason to revive a mental-health product. [S01–S02]

### Explicit non-goals

No offender identification, facial recognition, suspect database, predictive-policing service, crime-risk score for a person, emergency dispatch, autonomous police submission, private social-feed scraping, real-time tracking of victims, safest-route guarantee or advertising based on distress. The app must not organise confrontation or vigilante patrols. Do not imply partnership with police, TfL, councils or BID operators without agreement.

## 2. Three local pilots: scope, enrichment and operational fit

### 2.1 Hounslow town centre

**Proposed scope:** a compact reviewed polygon around High Street, Treaty Centre and Bell Square, with selected pedestrian approaches to Hounslow Central/East. These are design anchors; exact station IDs, entrances and boundaries must be resolved from appropriate sources and checked on the map. Do not silently include the whole borough or assume every station approach fits the final polygon.

**Data leads:** Hounslow Data Hub/crime insight for context; Hounslow Highways for public lighting/pavement reports; common Police.uk, MPS, TfL and basemap sources. The civic reporting site is a useful potential integration, but read-feed availability and bulk reuse rights were not established. [H01–H05]

**First practical task:** a person checking the town-centre approach can see a reviewed environmental observation, whether an authorised maintenance notice refers to the same asset, its latest status, and relevant transport information.

**Partner hypothesis:** a town-centre/community-safety or highways representative can help validate maintenance status and publication rules. No such partner has agreed. No general street-refuge register was verified here. Do not repurpose a similarly named mental-health “Safe Space” as a walk-in street-safety haven.

### 2.2 Camden Town centre

**Proposed scope:** Camden Town and selected Camden Road station approaches, Camden High Street and Parkway; explicitly approve whether market/canal edges belong in the pilot. This is not the London Borough of Camden.

**Data leads:** a council Safety Bus listing, Safe Havens scheme, street-lighting inventory and shared transport/crime sources. The current council page lists the bus outside Camden Town station on Friday/Saturday nights, 21:30–02:30; the listing is a published schedule, not confirmation of deployment on a specific night. [C01–C04]

**First practical task:** a night-time visitor checks current transport notices, a registered help option, and a community observation without mistaking a lamp inventory or monthly police count for a current incident.

**Implementation pitfall:** an overnight Friday service ending at 02:30 belongs to Saturday's early hours. Model Europe/London dates, daylight-saving transitions and schedule exceptions rather than a single `is_open` Boolean. Keep scheme registration, scheduled hours, confirmed availability and source age separate.

### 2.3 West Croydon

**Proposed scope:** the West Croydon interchange, selected London Road/North End approaches, and reviewed links between rail, tram and bus facilities. Do not substitute East Croydon or all of Croydon. Resolve each transport facility and parent/child relation; a station-centre point is not every stop or entrance.

**Data leads:** shared police/transport data, council lighting reporting and a prospective relationship with Croydon BID Street Rangers. The BID Radio Link service is evidence of an existing coordination scheme, not permission to copy its private operational or crime-intelligence data. [W01–W04]

**First practical task:** an interchange user sees source-scoped transport information and reviewed local observations, and an explicitly authorised partner can update a notice within its remit. Partner feeds and live ranger availability are not established.

### 2.4 Geography acceptance gate

Store each pilot in `config/pilot_areas.json`, then generate versioned GeoJSON with approved station IDs. Required fields: custom ID/name, borough identifier/vintage, source boundaries, CRS, drawn/derived method, polygon version/checksum, reviewer and review date, station/facility IDs, inclusion/exclusion notes. No publication of exact pilot counts before this gate.

Use a modest query margin when necessary for source retrieval, but aggregate only the approved footprint. Keep “nearby outside pilot” separate. Geographic centroids and circular queries must not be labelled ward totals. A point on a boundary needs a deterministic inclusion rule; document uncertainty introduced by anonymised source coordinates.

## 3. Research evidence and source registry

The full machine-readable inventory is `research/source_registry.json`; references are expanded in `research/sources.md`. Status distinguishes a read page, checked documentation, inspected metadata, actual connector tests and reuse approval. None of the connectors is implemented by this plan.

### 3.1 First-priority sources

| Source family | Use | Interpretation boundary |
|---|---|---|
| Police.uk | historical categories and approximate geographic context | monthly records, not live alerts or individual event confirmation |
| MPS geography tables | borough/ward/LSOA comparisons and background | taxonomy/resolution differ; do not double-count with Police.uk |
| TfL | current operational notices and station/facility identity | a delay is not evidence of interpersonal danger |
| Council help schemes | places to ask for assistance | listing and current operational capacity are separate |
| Council/authorised civic faults | infrastructure status and change history | a public complaint is not necessarily operator-confirmed |
| First-party reports | local observations and issue updates | claims at intake; privacy and publication review required |
| OSM/approved basemap | pedestrian/place/asset context | map coverage is uneven; attributes do not establish today's conditions |

Police.uk metadata returned July 2026 as the latest street reporting month. The MPS catalogue shows a newer borough/LSOA window and a different ward window. Refresh those details at implementation and display each layer's own period. Do not put a single “updated today” badge over every source. [P03–P04]

### 3.2 Source acquisition hierarchy

Prefer official APIs/downloads; then explicitly permitted public datasets/feeds; then limited allowed public-page extraction; then manually reviewed source cards when automation is unavailable. Restricted partner sources require explicit agreements and scoped credentials. A page accessible without login is not automatically licensed for bulk copying.

Do not scrape Nextdoor feeds, private groups, police intelligence systems, or the BID's restricted network. Do not use a user's login session, bypass an access control or rotate identities to evade rate limits. A blocked source should have a useful handoff/citation and documented integration status, not a hidden workaround.

### 3.3 Per-source record

Track source ID, owner, source family/root lineage, data authority/domain, canonical URL, content type, permitted access mode, licence and attribution, permissions status, geography, update frequency, observation/validity semantics, precision, taxonomy, source parser version, request/response limits and health state. Store ETag/Last-Modified/checksum where available. Check changed content before trusting old extraction rules.

Distinguish dataset/publisher family, original-claim lineage and stable source-record identity. A publisher can contain many distinct events; a shared publisher does not make every report a duplicate. Conversely, different websites can repeat the same originating claim. Unknown lineage remains unknown independence.

Use a fixed host allowlist and validated redirects; no arbitrary URL fetching from a report body. Bound response sizes and timeouts, redact request credentials, handle HTTP 429 with backoff, and quarantine schema changes. Separate internal jobs from public unauthenticated endpoints.

### 3.4 Sources to defer

Footfall and historical road-collision data may later contextualise exposure or pedestrian safety. Verify actual coverage, licence and measurement first. Avoid unrelated health, air-quality, property-price or demographic integrations in the initial product. Do not infer personal danger from deprivation, ethnicity, migration status or police stop/search activity.

## 4. User experience and screen requirements

### Public landing/map/list

Open without login or location permission. Choose one of the three pilot areas. Tabs: **Now**, **Community**, **Get help**, **Historical context**. Provide an equivalent accessible list and meaningful source-outage states if the basemap fails. Default to actionable notices/help rather than a red risk heatmap.

Each card shows source class, relevant location, what is asserted, observed/published time, source age, current status, source link and uncertainty. A source is “official” only within its actual domain. A review label must not say a crime has been proved.

### Preferences/account

Account needed for cross-device follows, own submissions and optional alerts, not public information or emergency help. Choose areas/stations, categories, transport modes, optional access requirements, language, time windows, quiet hours and delivery channel. No demographic or home/work-profile questionnaire. A person can browse anonymously using local in-memory selections.

### Reporting

Begin with two clear routes: **Share a local observation** and **Find the official crime-reporting route**. An incident account in the app is not a police report. Permit structured experienced/witnessed information without identifiable suspect/victim details; show appropriate emergency guidance without requiring form completion.

Fields: category, approximate place, observed time or interval, firsthand/other-source distinction, short optional factual description, publication preference and optional acknowledgement of an existing official report without collecting its case reference in v0. No photo/video uploads in the first release. Do not ask the person to investigate, follow someone or gather evidence at risk.

On submission: private record, review status, withdrawal/correction controls and realistic operating-hours notice. No immediate public pin. An optional editable summary can be copied by the user for an official reporting channel, but no auto-send or “police notified” success message. BTP 61016 is non-emergency rail reporting; emergencies use 999. StreetSafe is a public-place concern route, not an emergency/crime-reporting replacement. [R01–R02]

### Notice detail and evidence view

Show the currently applicable revision, affected places, why it appears, source statements, known relationships, contradictions and limits. Keep raw private submissions hidden. A compact “How these records relate” view is sufficient for users; moderators can open a bounded graph inspector with an accessible table.

### Help directory

Separate scheme, services, published schedule, eligibility, accessible entrance information, last check, operator-confirmed availability and contact source. “Registered” is not “open now”; an open business is not automatically staffed for the scheme. Directory omissions are visible; do not invent a support venue to fill a pilot.

### Moderator/partner console

Queue by area and category; inspect original private observation only within role scope; request clarification without exposing contact details publicly; redact; approve a summary; reject; group candidate duplicates; record contradictions; resolve/retract; view impact on previous notices/subscribers. Account roles cannot be self-assigned. A partner publishes only authorised claims in its domain and area.

### Research dashboard

Coverage before correlation. Show imported periods and source families, pending extraction issues, available comparisons and insufficient-data messages. Reviewed analysts—not normal readers—can run constrained analyses. No arbitrary query over rare reports.

## 5. Knowledge graph: what to build

The detailed ontology, relation decision table and storage guidance are in `docs/knowledge_graph.md`. The graph is central to this build, not a presentation-only extra.

Core chain:

```text
Source -> SourceSnapshot -> Observation -> affects Place/Asset
                              |
                      reviewed publication
                              v
                        PublishedNotice
                              |
                  links to relevant source evidence

Place -> within PilotArea
HistoricalAggregate -> contextual history for PilotArea/Place
HelpLocation -> nearby approved Place, with separate availability assertions
UserPreference -> privately follows Place/Area -> relevant PublishedNotice
```

Use a **claim-centred, provenance-aware graph**: source statements remain distinct from their publication status and from inferred relations. W3C PROV-O is a useful reference for derivation/activity/provenance semantics. [K01]

### 5.1 Relationship semantics

| Relation | Product meaning |
|---|---|
| Same place | records refer to the same reviewed geographic entity |
| Same source item | exact stable source key; revisions linked |
| Possible duplicate observation | candidate for review; not an established common incident |
| Same operational issue | supported by reference/asset/interval and appropriate review |
| Historical context | shared coarse geography/period only |
| Statistical association | result of a defined analysis, not event linkage |
| Contradiction/supersession | sources or versions differ; retain explanatory history |
| Personal relevance | private match to explicit settings, not a danger estimate |

Do not collapse these into `related=true` or a single percentage. Every edge needs evidence references, method/version, reason codes, time/precision, access classification and lifecycle. Transitive similarity is not identity. A common source family prevents counting syndicated copies as independent corroboration.

### 5.2 Storage decision

Use one **Supabase Postgres/PostGIS** database with typed domain tables and qualified node/edge/assertion tables. PostGIS is for spatial operations; graph tables are for relationships and provenance. [E02]

No Neo4j requirement in v0. A later read-only projection can be justified by demonstrated graph-query needs, but should not become a second source of truth. No vector store is required for the deterministic graph. Optional redacted semantic similarity is only candidate ordering after baseline quality evaluation; it cannot create verified incident links.

### 5.3 Important non-link

A user reports an incident this evening. Police.uk later publishes a record in the same month and approximate area. The app must **not** say “confirmed by police.” Public street data lacks the precision and common identifiers needed for that claim. Its public record ID is not a police case number. [P01–P02]

Instead display: “Historical police-recorded context is available for this area and period. We cannot establish that it describes this report.” That is a graph relationship with a useful limit, not a failed feature.

## 6. Correlation and cross-source analysis

`docs/correlation_protocol.md` defines the complete protocol. Implement the data model and eligibility gates now; do not fabricate findings to populate it.

### Questions the app can answer

- Are two records versions of an explicitly identified source item?
- Do a civic complaint and repair notice refer to the same lamp/issue under supported identity and timing?
- Which reports require review because they may overlap, repeat or contradict one another?
- What source/category/period coverage exists for the selected area?
- After sufficient data collection, how do comparable aggregated series move together?

### Questions it must not pretend to answer

- Whether nearby police and community records necessarily describe one incident.
- Whether the same person committed two offences.
- Whether report popularity proves accuracy.
- Whether a correlation coefficient is the probability of crime or a measure of police confirmation.
- Whether missing official data proves a community report false or an area safe.

### Planned analysis pipeline

Freeze a research question; harmonise category, geography and observation month; preserve provenance and revisions; remove duplicate source families; characterise missingness; inspect distributions; apply a justified descriptive or inferential method; review interpretation; publish only privacy-approved summaries.

A proposed entry gate is 24 common months, ideally 36, with sufficient completeness and variation. This is not a universal statistically sufficient sample. There is currently no historical community series for a new app: the honest launch output is **“not enough comparable data yet.”** Three area totals are not a sound substitute.

Use Spearman correlation only as a defined descriptive measure where appropriate; avoid naive significance assumptions with dependent cells/months. A later count model needs justified exposure/covariates and temporal validation. Report sample units, missingness, limitations and method versions—not just a number. [A01–A02]

## 7. Personalisation: individual utility without individual risk profiling

Start with explicit settings and deterministic, explainable selection. This already personalises the app for each user and does not require training data or collecting identity attributes.

Suggested settings:

- Follow one or more pilot areas, stations or approved coarse zones.
- Choose notice categories: transport, access facilities, infrastructure, reviewed community observations and optional historical digest.
- Choose usual travel windows, time zone, quiet hours and channel.
- Choose language and presentation/access preferences without diagnoses.
- Mute/unfollow, pause, export and delete settings.

Selection has two stages:

**Eligibility first:** publishable/current evidence, user's chosen scope/channel, allowed source class and permissions, no retracted/superseded data, no unresolved restriction.

**Ordering second:** area/station match, chosen category/access preference, whether the notice is actionable, current validity, source status and recency within a sensible window. Prefer lexicographic rules or versioned explainable weights; no weight is a likelihood of harm. Do not downrank essential help or emergency information because a user has not clicked it.

Every personalised item includes reason codes such as `follows_station`, `selected_access_updates`, `within_chosen_time_window`. Explain the actual reason in plain language. Never infer that a user is vulnerable from gender, postcode, disability diagnosis or browsing behaviour.

Store follows/preferences in an owner-private schema. Public graph requests cannot enumerate followers, deduce commute windows or access private neighbours. Account A must never receive account B's cached personalised response.

## 8. Trust, moderation and official reporting boundaries

Use independent fields for source type, first/secondhand status, publication review, current operational status, freshness and relationship status. “Human reviewed” does not equal “officially confirmed”. A councillor, ranger or trusted business partner has defined authority, not universal truth status.

Community moderation states: `submitted`, `in_review`, `needs_clarification`, `approved_for_summary`, `rejected`, `withdrawn`. Public notice lifecycle: `scheduled`, `active`, `resolved`, `expired`, `retracted`, `superseded`. The source may still be unverified even when publication is approved.

No public names, photos, licence plates, live victim locations, suspect profiles or appearance-based “suspicious person” reporting. Describe observed behaviour or environmental issue. Do not expose another user's private report through a duplicate-match suggestion.

Source independence is a factual property to investigate, not simply different usernames/domains. Two posts linking the same original account are one root evidence family. An official article may report allegations; preserve that wording.

For initial public release, publish community summaries only when a named moderator can support the process. Keep external community-warning pushes disabled until the team establishes a reviewed policy and operational capability. Private complaint withdrawal and public correction are core features, not backlog polish.

## 9. Alert and notification engine

Build the in-app inbox first. Optional push comes after correctness and device testing. No blanket promise of real-time or emergency delivery.

Eligibility requires an active/relevant/current notice, allowed evidence/partner scope, user opt-in, current settings, no unresolved publication restriction and a source-supported practical message. Historical counts may appear in an opted-in monthly digest but cannot trigger “avoid this road now”.

Use a transactional outbox with unique `(notice_id, revision, subscription_id, channel)` keys and explicit attempted/delivered/failed/suppressed states. Provider acceptance is not proof a user read a message. Use retry bounds, TTL, idempotency, quiet hours and generic lock-screen copy. If delayed delivery would be misleading, suppress it.

When opened, a notification resolves the latest notice status. Corrections/retractions cancel queued prior versions and may notify prior recipients without waiting for normal topic ranking. Retraction workflows must not leak the reason if it includes private information.

**Freshness:** observation/source publication time, effective interval, retrieval time, review time and expiry are separate. A fresh scrape of old content does not renew an event. A fetch failure does not mean every event has resolved. Absence from a response is meaningful only when the adapter knows the snapshot is complete and the source's removal semantics are documented. Otherwise mark unknown/stale and preserve history.

Source-specific freshness parameters should be configurable, reviewed and shown. No one hardcoded “everything expires after one hour” rule. Scheduled future disruptions must not look active early. Demo notices must never reach production subscribers.

## 10. Historical crime ingestion and map

### Pipeline

Discover available months; freeze pilot geography; fetch/download permitted source rows; validate schema and source categories; preserve source snapshots/checksums under retention rules; deduplicate repeated imports; aggregate at permitted resolution; materialise public slices; publish coverage and caveats.

Police.uk supports polygon queries; its polygon coordinate convention differs from GeoJSON. Implement and test conversion, bounds and query limits. Recursively split oversized retrieval scopes only with stable union/de-duplication rules. Do not drop records because they share an anonymised location. Numeric IDs can change across imports and missing persistent IDs require source-aware multiplicity handling. [P01]

Keep crime and ASB separate. BTP fields preserve transport provenance but do not create a live platform incident feed. Do not fetch the same events through two routes and add them. Do not combine MPS totals and Police.uk records as independent crime counts.

### Map interpretation

Prefer reviewed coarse grid/area aggregates, normally with an explicit monthly or multi-month period. Grid size is a display choice, not a statement of event-coordinate accuracy. Do not create exact doorstep pins or manufacture women-only/sexual-offence-only street categories from a combined publication category. Suppressed data must stay suppressed. [P02–P04]

A higher recorded count is not an individual probability of victimisation. Town-centre visitors and resident populations differ. Do not invent a per-user rate from borough population or use a borough rate as a pilot street score.

Display source coverage and unknowns. A public filter must not reconstruct rare sensitive counts through repeated differencing. Start with preapproved slices, not a universal graph/SQL query endpoint.

## 11. Architecture and repository layout

Use the existing repository's sound conventions. For a new project: React + TypeScript + Vite, Leaflet, Supabase Auth/Postgres/PostGIS, Netlify hosting/functions, bounded scheduled jobs and off-request batch ingestion.

```text
Approved public data / permitted feeds / partner notices
                         |
            source registry + acquisition gates
                         |
           bounded fetch -> snapshot -> validation
                         |
           source-specific normalisation + lineage
                         |
                 Postgres / PostGIS
           domain tables + evidence graph
                  /                \
      public projections        private reports/preferences
               |                     |
        map/list/details        moderation + personal relevance
                  \                 /
                 corrected notice revisions
                         |
               transactional outbox
                         |
                 inbox / optional push
```

Suggested layout:

```text
apps/web/src/{app,features/map,features/feed,features/reporting,
  features/preferences,features/moderation,features/evidence,features/help}
packages/contracts/src/
packages/domain/src/
packages/geography/src/
packages/graph/src/
packages/personalization/src/
packages/notifications/src/
packages/analytics/src/
services/ingestion/src/{police,tfl,civic,help,shared}/
netlify/functions/
supabase/migrations/
supabase/tests/
scripts/{backfill,rebuild-projections,verify-sources}/
config/areas/
fixtures/synthetic/
docs/{architecture,operations,research,decisions}/
tests/{unit,contract,integration,e2e,privacy}/
```

Keep TypeScript end to end where practical. A separate Python analysis environment is optional only for offline statistical work with a locked dependency file and JSON result contract. Do not introduce Kafka, Spark, a separate graph database or autonomous agent orchestration for three compact pilots.

### Netlify scheduling and compute

Current Netlify documentation limits scheduled functions to 30 seconds and only schedules published deploys. [E01] Use them for short shared source refreshes/queue coordination; use checkpointed CLI or a deliberately configured job runtime for long backfills. Test every worker independently in preview/local environments; an untriggered preview schedule is not a successful pipeline.

Poll per source/area batch, not per user. Establish configuration for freshness and cost. A five-minute shared refresh interval, if selected, is a product setting subject to source quotas and sponsor limits, not a “real-time” claim or an established default. Bound concurrency, lock overlapping jobs and resume checkpoints.

### Maps, auth and secrets

Choose a basemap provider with suitable usage/privacy conditions. OSM data and the public tile hosting service have different terms; no bulk offline tile scraping. [G02] Public API keys permitted by a map vendor must be origin-restricted; server credentials stay server-side.

Supabase authentication does not itself authorise row access. Design grants, RLS, scoped RPCs and public projections; secure views and privileged service-role access deliberately. [E03] The browser must never receive a service-role key. Avoid generic privileged SQL endpoints and LLM-generated database queries.

## 12. Domain schema and API contracts

`contracts/domain.ts` contains normative proposed types, not a deployed SDK. Runtime validation must implement the same allowed states. The coordinator owns contracts and migrations.

Core tables:

- `areas`, `places`, `place_external_ids`, `assets`, `source_registry`.
- `source_snapshots`, `ingestion_runs`, `source_record_versions`, `source_families`.
- `private.observations`, `private.observation_revisions`, `private.moderation_decisions`.
- `published_notices`, `notice_revisions`, `notice_places`, `help_locations`, `availability_assertions`.
- `graph_nodes`, `graph_assertions`, `assertion_evidence`, `relation_candidates`.
- `historical_aggregates`, `coverage_periods`, `analysis_runs`, `analysis_results`.
- `private.preferences`, `private.subscriptions`, `private.notification_outbox`, `private.notification_receipts`.

Use foreign keys, uniqueness per source namespace/version, revision control, server-generated ownership, current publication constraints and immutable audit metadata with a reviewed retention policy. Do not retain sensitive narrative forever. Include idempotency and expected revision for mutable operations.

Proposed APIs:

| Method/path | Purpose | Access |
|---|---|---|
| GET /api/areas | reviewed geography and source coverage | public |
| GET /api/feed | approved public notices by area | public |
| GET /api/notices/:id | current published revision | public/scoped |
| GET /api/notices/:id/evidence | safe bounded evidence explanation | public projection |
| GET /api/help | approved directory/status | public |
| GET /api/history | approved period/category aggregates | public with bounded filters |
| POST /api/reports | private user observation | member, intake gate |
| PATCH /api/reports/:id | own correction/withdrawal request | owner |
| GET/PUT /api/preferences | own explicit preferences | owner |
| GET /api/me/feed | personalised permitted feed | owner, no-store |
| GET /api/me/notifications | inbox | owner, no-store |
| POST /api/moderation/:id/decision | approve/redact/reject/correct | scoped moderator |
| GET /api/moderation/relations | private candidate queue | scoped moderator |
| POST /api/moderation/relations/:id/decision | reviewed relation decision | scoped moderator |
| GET /api/analysis/:id | reviewed bounded analysis result/status | analyst/approved summary |

Use strict schemas, bounded pagination, no arbitrary SQL/graph predicates, parameterised queries, consistent errors without private details, auth scope checks and per-route abuse limits. API responses carry `schema_version`, source/period coverage, generated time and `synthetic`. Personal responses use `Cache-Control: no-store`. Optimistic concurrency conflicts must return a safe conflict result instead of overwriting another moderator's correction.

## 13. Optional AI: narrow and removable

No model is required for source identity, time validity, authorisation, notification eligibility or the graph's basic relationships. AI may later suggest a summary/category from permitted public source text or a redacted report, and help search approved evidence with citations. Netlify sponsorship does not require AI in a safety-critical decision.

Guardrails: off by default; fixed approved input sources; no hidden personal data or account preferences; no automatic publication; preserve allegations/uncertainty; no suspect identification, corroboration declaration or invented sources; bounded output schema; retained original; human review; explicit provider/data-processing review; timeout/cost kill switch. Extracted webpage/report text is untrusted data, not instructions. An LLM must not execute arbitrary URLs, SQL, Cypher or tools from it.

Do not send real sensitive disclosures to coding-agent chats, telemetry or test fixtures. Synthetic development examples should be labelled in files and UI. Document content logging and vendor retention behaviour before enabling any live model path.

## 14. Security, privacy and operational governance

Read `docs/privacy_threat_model.md`. ICO guidance treats identifiable suspected-offender allegations differently from ordinary anonymous aggregate statistics; combining datasets can introduce identification risks. User-to-user service obligations and DPIA needs require review rather than assumptions. [L01–L04]

Public launch gates: source rights/terms; staffing and accountability; lawful-basis/data classification/DPIA screening; moderation/appeal/deletion processes; tested RLS and graph visibility; incident correction/rollback; clear reporting boundaries; accessible support route; no secret leakage; synthetic/live separation; privacy notice that matches actual data flows.

Baseline privacy: no precise movement history, home/work addresses, demographic vulnerability inference, raw report logging, session replay, public profile map or unbounded public graph. Collect only what the workflow demonstrably needs. Make personalisation optional and reversible.

Account and report deletion must propagate to graph projections, indexes, caches and queued delivery. Backups have documented lifecycle; do not claim instant deletion from every backup. Preserve only justified minimal audit tombstones. Public-source raw snapshots also need licence and personal-data review; “bronze layer” is not a licence to retain everything forever.

## 15. Quality and test plan

`tests/acceptance_matrix.json` contains specified scenarios and owning workstreams. These are requirements, not tests already run.

Test layers: pure domain logic, parser/contract fixtures, local database/RLS, graph-query access, integration transitions, mobile/keyboard E2E, source failure/clock/DST, dependency/secret checks and an end-to-end deployed smoke test with test-only notifications.

Critical invariants:

- Historical rows cannot generate urgent avoidance alerts.
- Approximate monthly police records cannot promote a community report to confirmed.
- Published incident text never reveals private report identities/location details.
- Same police map point may contain multiple distinct records.
- User A cannot infer User B's follows or reports through graph, cache or exports.
- A correction invalidates derived explanation and queued old notifications.
- Unknown/stale/missing is not safe, zero or resolved.
- A source/asset listing is not live availability.
- Synthetic evidence never mixes with production graphs, statistical results or alerts.
- Unavailable correlation is an explicit valid state, not a fabricated percentage.

Set initial engineering targets as proposed budgets, not guarantees: usable mobile list without map tiles; keyboard complete reporting journey; bounded graph query; bounded source worker; no duplicate notification on replay; complete relevant source labels. Measure actual build/runtime performance and document environment rather than claiming arbitrary scores.

## 16. Parallel Codex workstreams and merge discipline

**Do not open eleven uncoordinated chats on the same checkout.** Use separate worktrees/branches based on one committed foundation. Codex officially supports independent worktree chats. [E04]

| Thread | Responsibility | Dependencies | Exclusive primary ownership |
|---|---|---|---|
| 00 | integration architect/contracts | none | root manifests, lockfile, contracts, migrations, environment config |
| 01 | three-area geography and registry | 00 contract | geography package, area fixtures and source registry |
| 02 | historical police ingestion | 00 + proposed 01 geometry | police adapter, snapshots, aggregate jobs |
| 03 | TfL/civic/help connectors | 00, station contract from 01 | transport/civic/help adapters and source tests |
| 04 | reporting/auth/moderation | 00 | reporting/moderation domain handlers and feature modules |
| 05 | knowledge graph/entity relations | 00; inputs from 02/03/04 | graph package, candidate matching, evidence projections |
| 06 | personal relevance/notifications | 00, published-notice contract | personalisation and outbox packages/handlers |
| 07 | map/list/consumer experience | 00, area/notice mocks | consumer map/feed/help/preferences views |
| 08 | correlation/research layer | 00, source contracts | analytics package and eligibility/results views |
| 09 | privacy/security review | 00 then all | security tests and threat-model review; request fixes from owners |
| 10 | QA/deployment/release | 00 then integration | cross-feature E2E, runbooks, release evidence; deploy only with approval |

**Wave A:** 00 freezes contracts, directory skeleton, adapters and synthetic fixture shape. Commit this as the common base.

**Wave B:** 01, 02, 03, 04 and 07 work concurrently; 09 begins threat review. Use typed mocks where another worker has not merged. No guessed schema changes.

**Wave C:** 05, 06 and 08 integrate against stable contracts; 07 connects real APIs; 09/10 exercise cross-feature behaviour.

**Wave D:** coordinator merges small reviewed branches in dependency order, applies migrations in one local/staging database, resolves interface changes, runs the full test set and publishes only the authorised environment.

All threads return: changed paths, commands actually executed, test results, source/permission blockers, interface requests and remaining defects. Nobody edits another thread's owned files without a contract change request. Only thread 00 modifies shared migrations/lockfiles. Thread 04 owns reporting/moderation UI; thread 07 owns consumer UI, avoiding duplicate screen edits. Separate dev ports/local database namespaces per worktree; never let parallel test resets target one production database.

## 17. Delivery phases: ambitious product, honest first demonstration

### Phase A — research-backed demonstrator

Three area configs, reviewed boundary tasks, map/list, real-source coverage cards, one successfully integrated transport/historical source, manually reviewed directory entries, isolated synthetic report → moderator → graph explanation → personalised inbox → correction flow. Use real current source content only where retrieved and checked; don't invent a live incident to fill the map.

For the original same-day hackathon deadline, this complete small journey outranks an unfinished collection of connectors. Start with all three area selectors but one canonical demonstration workflow instantiated in each. Clearly distinguish simulated community data from genuine source records.

### Phase B — controlled pilot

Reviewed polygons and actual source imports, accountable local moderation, approved ingestion permissions, authenticated reports/follows, real correction workflow, tested source freshness, data deletion and privacy controls, structured pilot interviews. Launch each area's community capability only when local staffing and coverage are sufficient; the other areas can remain read-only.

### Phase C — relationships and measured comparison

Evaluate candidate linkage with reviewed synthetic and consented labelled examples, add authorised asset/fault links, monitor precision/false merges and source independence, accumulate legitimate common history. Show descriptive associations only when eligibility/review requirements pass. Add push only after in-app correctness, user consent and device behaviour are verified.

### Phase D — justified expansion

Additional permitted feeds, optional analyst models, independently reviewed public aggregate insights, partnership operations and accessibility improvements. No automatic expansion into offender profiling or predictive danger ranking. Measure whether new data improves tasks before expanding infrastructure.

## 18. Validation and local research

Recruit consenting adults and prospective moderators from each selected area. Do not pressure anyone to describe trauma or send a real crime report. Use fictional scenarios: find current relevant notice; identify its source; distinguish monthly history; find a listed help location and notice unknown availability; submit and withdraw a synthetic observation; understand why two records were linked only contextually.

Ask local operators where information currently gets lost, how they verify changes, what they can responsibly publish and whether this duplicates an existing workflow. A proposed partner is not a committed partner. Public data availability is not proof of demand.

Record task success, time/steps, mistaken certainty, perceived control, source comprehension, correction comprehension, inappropriate notification rate and moderator burden. Distinguish users' self-reported intentions from observed behaviour. Do not measure success by more alarming content, more reports or longer retention.

Graph evaluation: human-reviewed linkage cases with ground-truth uncertainty retained; report precision/recall only for labels genuinely known, false merge/split rates, calibration only if a probabilistic model actually exists, and privacy failures separately. A correct “cannot establish” is an important valid outcome.

## 19. Costs, reliability and operating ownership

No hardcoded sponsor allowance, free-tier entitlement or model pricing. Verify actual Netlify, database, map and delivery budgets before paid changes. Rough workload formula: `polls_per_day = sources_or_batches × 1440 / polling_interval_minutes`; cost also depends on response size, compute, DB writes, logs, map loads and delivery. Revalidate quotas and terms for the chosen cadence.

Use one shared source refresh and public materialised feed instead of per-user scraping. Import 12–36 months as a checkpointed job, not each map request. Keep public and private caches separate. Build source-health and permission-status dashboards. A failing provider should degrade only its layer, not imply all clear or crash the entire app.

Name owners for moderation, source licensing, schema changes, security incidents and notifications. Keep a runbook for disabling intake/push, retracting a bad notice, revoking a partner, quarantining an adapter, rotating a leaked credential and rebuilding projections. Process these as regular operations, not heroic manual interventions.

## 20. Demo narrative and honest pitch

Show a fictional user following West Croydon; a real source-backed transport card where available; then an isolated demo community observation passing through moderation. Explain its graph relationships and why a monthly police aggregate is only context. Show a second user's different preference-based feed. Resolve/retract the demo notice and show changed subscriber status. Switch to Camden to demonstrate the help-directory schedule/availability distinction and to Hounslow for the infrastructure-source pattern.

Pitch:

> We connect local observations with their sources, places and history so people can see what is current, what is uncertain, where to seek help and why an update matters to their journey. Our graph explains relationships rather than inventing certainty.

Report only actual integration/test/interview results. No verified rankings without reproduced inputs; no claim that police validated user reports; no claim of preventing violence or guaranteeing a safe route.

## 21. Immediate Codex instruction

```text
Read this generalist.md, START_HERE.md and AGENTS.md completely.
Read your assigned prompts/NN-*.md and the shared contract files.

Implement the three-area safety platform for Hounslow town centre,
Camden Town centre and West Croydon. The previous mental-health and
West End scope is superseded. Preserve unrelated repository work.

Work inside your assigned paths and branch/worktree. Use the frozen
shared contracts. Propose changes to the coordinator instead of silently
editing shared schemas, migrations, manifests or another worker's files.

Build real functional code and tests, not just mock screens or a plan.
Preserve source provenance, publication/review status, privacy, geographic
and temporal precision, and correction semantics throughout the graph.
Implement insufficient-data states rather than inventing correlations.

Use permitted public sources and explicit source registry gates.
Blocked credentials/permissions must be reported honestly, with a typed
fixture-only adapter if appropriate. Never pretend synthetic data is live.

Run applicable checks, fix observed issues, and return actual results,
changed files, remaining blockers and integration instructions. Do not
change production services, send real external alerts, or approve paid
upgrades without the user's specific authorisation.
```

## 22. Verification boundary and references

This package specifies implementation and test requirements. No application, database, geographic boundary, source connector, live community service or deployment has been created. No raw crime totals or community–police coefficients have been computed. Direct runtime endpoint probes failed; documented web research and the Police.uk metadata response are separately recorded. These distinctions must remain visible in handoffs.

Read `research/sources.md` for full primary-source URLs and `research/source_registry.json` for per-source verification/reuse status. Read `research/research_notes.md` for differences between supplied Grok research, independent research and this plan's design choices.

## Appendix — primary-source links

- **[P01] Police.uk street-crime API** — https://data.police.uk/docs/method/crime-street/ (documentation_checked).
- **[P02] Police.uk publication methodology** — https://data.police.uk/about/ (page_read).
- **[P03] Police.uk latest reporting month** — https://data.police.uk/api/crime-last-updated (response_read_via_web).
- **[P04] MPS recorded crime geographic breakdown** — https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m/ (catalogue_and_methodology_read).
- **[P05] ONS crime statistics user guide** — https://www.ons.gov.uk/peoplepopulationandcommunity/crimeandjustice/methodologies/userguidetocrimestatisticsforenglandandwales (documentation_checked).
- **[T01] TfL Unified API** — https://tfl.gov.uk/info-for/open-data-users/unified-api (documentation_checked).
- **[T02] TfL API portal** — https://api-portal.tfl.gov.uk/apis (catalogue_read).
- **[H01] Hounslow Data Hub** — https://stats.hounslow.gov.uk/ (page_read).
- **[H02] Hounslow crime insight** — https://stats.hounslow.gov.uk/crime-insight/ (catalogue_read).
- **[H03] Hounslow Highways public reports** — https://fms.hounslowhighways.org/ (page_read).
- **[H04] Hounslow street/traffic lights** — https://www.hounslow.gov.uk/roads-streets/street-traffic-lights (page_read).
- **[H05] Hounslow safer communities strategy files** — https://www.hounslow.gov.uk/downloads/download/2163/community-safety (catalogue_read).
- **[C01] Camden staying safe at night** — https://www.camden.gov.uk/staying-safe-at-night (page_read).
- **[C02] Camden Safe Havens** — https://www.camden.gov.uk/safe-havens (page_read).
- **[C03] Camden street-lighting dataset** — https://opendata.camden.gov.uk/Environment/Camden-Street-Lighting/dfq3-8wzu (catalogue_read).
- **[C04] Camden street-lighting location view** — https://opendata.camden.gov.uk/Environment/Camden-Street-Lighting-Location/jx8t-gxyu (catalogue_read).
- **[W01] Croydon BID Street Rangers** — https://croydonbid.com/business/resolve/street-rangers/ (page_read).
- **[W02] Croydon BID Radio Link** — https://croydonbid.com/business/resolve/radio-link/ (page_read).
- **[W03] Croydon lighting fault report** — https://www.croydon.gov.uk/streets-roads-and-transport/street-maintenance-repairs-and-improvements/street-lighting/report-street-or-sign-lighting-issue-online (page_read).
- **[W04] Croydon street-lighting service** — https://www.croydon.gov.uk/streets-roads-and-transport/street-maintenance-repairs-and-improvements/street-lighting (page_read).
- **[G01] OpenStreetMap lighting tag** — https://wiki.openstreetmap.org/wiki/Key:lit (documentation_checked).
- **[G02] OSMF tile usage policy** — https://operations.osmfoundation.org/policies/tiles/ (documentation_checked).
- **[G03] ONS Open Geography Portal** — https://geoportal.statistics.gov.uk/ (candidate_not_fetched).
- **[R01] Met StreetSafe** — https://www.met.police.uk/notices/street-safe/street-safe/ (page_read).
- **[R02] BTP text reporting** — https://www.btp.police.uk/police-forces/british-transport-police/areas/campaigns/How-to-use-our-text-number/ (page_read).
- **[K01] W3C PROV-O** — https://www.w3.org/TR/prov-o/ (documentation_checked).
- **[K02] W3C SHACL** — https://www.w3.org/TR/shacl/ (documentation_checked).
- **[A01] SciPy Spearman correlation** — https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html (documentation_checked).
- **[A02] statsmodels negative-binomial family** — https://www.statsmodels.org/stable/generated/statsmodels.genmod.families.family.NegativeBinomial.html (documentation_checked).
- **[A03] Runaway Feedback Loops in Predictive Policing** — https://proceedings.mlr.press/v81/ensign18a.html (paper_page_read).
- **[L01] ICO criminal-offence data definition** — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-is-criminal-offence-data/ (guidance_read).
- **[L02] ICO rules on criminal-offence data** — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-are-the-rules-on-criminal-offence-data/ (guidance_read).
- **[L03] ICO DPIA screening** — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/ (guidance_read).
- **[L04] Ofcom illegal-content duties** — https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act (guidance_read).
- **[E01] Netlify scheduled functions** — https://docs.netlify.com/build/functions/scheduled-functions/ (documentation_checked).
- **[E02] Supabase PostGIS** — https://supabase.com/docs/guides/database/extensions/postgis (documentation_checked).
- **[E03] Supabase RLS** — https://supabase.com/docs/guides/database/postgres/row-level-security (documentation_checked).
- **[E04] Codex worktrees** — https://developers.openai.com/codex/app/worktrees/ (documentation_checked).
- **[S01] UN SDG 11** — https://sdgs.un.org/goals/goal11 (page_read).
- **[S02] UN SDG 5** — https://sdgs.un.org/goals/goal5 (page_read).
