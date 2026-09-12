# Source registry

Checked 12 September 2026 unless marked candidate. Page availability is not permission, current field accuracy, or a working integration.

## [P01] Police.uk street-crime API

https://data.police.uk/docs/method/crime-street/

Status: **documentation_checked**. Monthly and approximate; persistent identifier is not a police case reference. Polygon queries are supported.

Reuse: OGL terms and attribution apply.

Next: Validate current schema, month availability, query limits and actual responses.

## [P02] Police.uk publication methodology

https://data.police.uk/about/

Status: **page_read**. Publication anonymisation, category grouping and completeness constrain joins.

Reuse: OGL v3 stated for data.

Next: Read known issues for each selected extract.

## [P03] Police.uk latest reporting month

https://data.police.uk/api/crime-last-updated

Status: **response_read_via_web**. Web response on research date: {"date":"2026-07-01"}; this is July 2026 reporting month.

Reuse: Police.uk data terms.

Next: Re-fetch at implementation; a reporting month is not an incident timestamp.

## [P04] MPS recorded crime geographic breakdown

https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m/

Status: **catalogue_and_methodology_read**. Catalogue lists borough/LSOA through Aug 2026 and ward through Jul 2026; sexual offences withheld at LSOA.

Reuse: Inspect current dataset licence and attribution.

Next: Download real files, inspect taxonomy, months, CONNECT caveat and checksums. No totals reproduced here.

## [P05] ONS crime statistics user guide

https://www.ons.gov.uk/peoplepopulationandcommunity/crimeandjustice/methodologies/userguidetocrimestatisticsforenglandandwales

Status: **documentation_checked**. Police-recorded crime and victimisation measurements have different coverage and limitations.

Reuse: ONS reuse terms.

Next: Document measurement and reporting processes before comparing series.

## [T01] TfL Unified API

https://tfl.gov.uk/info-for/open-data-users/unified-api

Status: **documentation_checked**. Operational transport source; preserve line, stop, facility and event scope.

Reuse: TfL transport-data terms; verify registration and quotas.

Next: Resolve real station/stop IDs and inspect current status/disruption schema.

## [T02] TfL API portal

https://api-portal.tfl.gov.uk/apis

Status: **catalogue_read**. Discover supported endpoints and authentication.

Reuse: TfL API terms; credentials/quotas unverified.

Next: Read-only integration smoke test and source-specific contract tests required.

## [H01] Hounslow Data Hub

https://stats.hounslow.gov.uk/

Status: **page_read**. Council statistics catalogue; not an independent live incident feed.

Reuse: Check each underlying dataset licence.

Next: Identify underlying primary tables, dates and derivations before reuse.

## [H02] Hounslow crime insight

https://stats.hounslow.gov.uk/crime-insight/

Status: **catalogue_read**. Context dashboard discovered; full numerical extract not reproduced.

Reuse: Underlying source licence to verify.

Next: Do not treat republished police numbers as independent corroboration.

## [H03] Hounslow Highways public reports

https://fms.hounslowhighways.org/

Status: **page_read**. Public reporting site exists; candidate for lighting and pavement observations.

Reuse: Bulk/API reuse permission not established.

Next: Identify authorised read API/feed and permissible fields before automation.

## [H04] Hounslow street/traffic lights

https://www.hounslow.gov.uk/roads-streets/street-traffic-lights

Status: **page_read**. Official handoff for infrastructure issues.

Reuse: Link to official service; no automatic submission.

Next: Verify route and distinguish council/highways/private responsibilities.

## [H05] Hounslow safer communities strategy files

https://www.hounslow.gov.uk/downloads/download/2163/community-safety

Status: **catalogue_read**. Strategy context for local partner conversations, not live warnings.

Reuse: Council document reuse terms.

Next: Partner/operator and staffing agreement still required.

## [C01] Camden staying safe at night

https://www.camden.gov.uk/staying-safe-at-night

Status: **page_read**. Page lists Safety Bus outside Camden Town station Friday/Saturday 21:30–02:30. Published schedule, not live deployment confirmation.

Reuse: Review reuse; cite official source.

Next: Review schedule before publication and model overnight dates correctly.

## [C02] Camden Safe Havens

https://www.camden.gov.uk/safe-havens

Status: **page_read**. Council scheme and map of participating places; current availability separate.

Reuse: Review map/dataset terms before bulk extraction.

Next: Extract only permitted locations and verify scheme eligibility, entrance and hours.

## [C03] Camden street-lighting dataset

https://opendata.camden.gov.uk/Environment/Camden-Street-Lighting/dfq3-8wzu

Status: **catalogue_read**. Street-lighting inventory discovered; asset existence is not current working status.

Reuse: Dataset-specific licence/API not validated.

Next: Inspect Socrata metadata, fields, licence, freshness and sample rows; probe failed in this runtime.

## [C04] Camden street-lighting location view

https://opendata.camden.gov.uk/Environment/Camden-Street-Lighting-Location/jx8t-gxyu

Status: **catalogue_read**. Related map/view discovered; may not be an independent dataset.

Reuse: Determine canonical parent dataset and licence.

Next: Resolve view lineage and prevent double ingestion.

## [W01] Croydon BID Street Rangers

https://croydonbid.com/business/resolve/street-rangers/

Status: **page_read**. Published street-ranger service; potential operational partner.

Reuse: No live data agreement exists for this project.

Next: Confirm coverage, staffing, authority and opt-in notice supply; not emergency dispatch.

## [W02] Croydon BID Radio Link

https://croydonbid.com/business/resolve/radio-link/

Status: **page_read**. Business/ranger/public-service coordination described; private scheme data excluded.

Reuse: Not an open intelligence feed; no scraping.

Next: Only integrate a specifically authorised public notice channel under agreement.

## [W03] Croydon lighting fault report

https://www.croydon.gov.uk/streets-roads-and-transport/street-maintenance-repairs-and-improvements/street-lighting/report-street-or-sign-lighting-issue-online

Status: **page_read**. Official reporting route and contractor system; not a validated open read feed.

Reuse: Bulk/API reuse permission not established.

Next: Verify stable canonical interface, jurisdiction and permissible read access.

## [W04] Croydon street-lighting service

https://www.croydon.gov.uk/streets-roads-and-transport/street-maintenance-repairs-and-improvements/street-lighting

Status: **page_read**. Service information, not a real-time map of operational lights.

Reuse: Council reuse terms to verify.

Next: Retain distinction between asset, complaint and repair confirmation.

## [G01] OpenStreetMap lighting tag

https://wiki.openstreetmap.org/wiki/Key:lit

Status: **documentation_checked**. Tag describes mapped lighting properties; missing tags mean missing information.

Reuse: OSM data ODbL; attribution; wiki has separate content licence.

Next: Do not infer current illumination or safety from tag presence.

## [G02] OSMF tile usage policy

https://operations.osmfoundation.org/policies/tiles/

Status: **documentation_checked**. Public tile service forbids bulk/offline prefetch and is not a guaranteed hosting service.

Reuse: Provider-specific conditions and visible attribution.

Next: Choose compliant provider; inspect privacy/referrer/cache behaviour.

## [G03] ONS Open Geography Portal

https://geoportal.statistics.gov.uk/

Status: **candidate_not_fetched**. Candidate canonical geography source, not a validated boundary asset in this pack.

Reuse: Verify selected boundary product licence.

Next: Choose boundary vintage, CRS, codes and downloaded checksum.

## [R01] Met StreetSafe

https://www.met.police.uk/notices/street-safe/street-safe/

Status: **page_read**. Public-place safety concerns channel, distinct from reporting a crime or emergency.

Reuse: Link to official service.

Next: Keep wording and destination current; no automatic submission.

## [R02] BTP text reporting

https://www.btp.police.uk/police-forces/british-transport-police/areas/campaigns/How-to-use-our-text-number/

Status: **page_read**. 61016 is non-emergency rail reporting; emergencies use 999.

Reuse: Link to official service.

Next: Check applicability and support SMS/manual copy without claiming submission.

## [K01] W3C PROV-O

https://www.w3.org/TR/prov-o/

Status: **documentation_checked**. Entity/activity/agent and qualified derivation concepts inform provenance design.

Reuse: W3C document terms.

Next: Implement practical relational constraints; no claim of full RDF conformance.

## [K02] W3C SHACL

https://www.w3.org/TR/shacl/

Status: **documentation_checked**. Reference for graph-shape validation; optional future RDF export.

Reuse: W3C document terms.

Next: Use SQL and runtime schemas first; do not add a second graph stack now.

## [A01] SciPy Spearman correlation

https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html

Status: **documentation_checked**. Rank correlation API; small-sample inference requires care.

Reuse: Software/documentation licences apply.

Next: Use dependence-aware inference, not naive significance on correlated cell-months.

## [A02] statsmodels negative-binomial family

https://www.statsmodels.org/stable/generated/statsmodels.genmod.families.family.NegativeBinomial.html

Status: **documentation_checked**. Count-model reference for later exploratory analysis.

Reuse: Software/documentation licences apply.

Next: Specify count process, dispersion, covariates and held-out validation.

## [A03] Runaway Feedback Loops in Predictive Policing

https://proceedings.mlr.press/v81/ensign18a.html

Status: **paper_page_read**. Primary research on feedback effects in predictive-policing systems.

Reuse: Research citation, not content licence for scraping.

Next: Use as motivation to separate observation/exposure/enforcement from underlying prevalence.

## [L01] ICO criminal-offence data definition

https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-is-criminal-offence-data/

Status: **guidance_read**. Identifiable suspected-offender allegations can be criminal-offence data; victims/witnesses are not automatically in that category.

Reuse: Guidance, not project legal advice.

Next: Classify fields and inferences, not just source labels.

## [L02] ICO rules on criminal-offence data

https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-are-the-rules-on-criminal-offence-data/

Status: **guidance_read**. Additional authority/UK-law conditions may be required alongside lawful basis.

Reuse: Guidance, not project legal advice.

Next: Review before processing identifiable alleged-offender data; prohibit it in MVP intake/public output.

## [L03] ICO DPIA screening

https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/

Status: **guidance_read**. High-risk processing indicators include relevant location/vulnerability/systematic assessment patterns.

Reuse: Guidance, not project legal advice.

Next: Complete DPIA screening and mitigations before real pilot launch.

## [L04] Ofcom illegal-content duties

https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act

Status: **guidance_read**. User-to-user service duties require assessment; hackathon label does not settle scope.

Reuse: Guidance, not project legal advice.

Next: Assess service scope, child access, reporting/complaints and moderation obligations.

## [E01] Netlify scheduled functions

https://docs.netlify.com/build/functions/scheduled-functions/

Status: **documentation_checked**. Current docs state 30-second scheduled-function limit; schedules run on published deploys.

Reuse: Account terms/quotas must be checked.

Next: Bound polling; use manual CLI/checkpoint jobs for backfills; explicitly test previews.

## [E02] Supabase PostGIS

https://supabase.com/docs/guides/database/extensions/postgis

Status: **documentation_checked**. PostGIS supplies geographic types and spatial queries in Postgres.

Reuse: Account terms/quotas must be checked.

Next: Enable extension deliberately and test SRID/index/query semantics.

## [E03] Supabase RLS

https://supabase.com/docs/guides/database/postgres/row-level-security

Status: **documentation_checked**. RLS and grants need explicit design; views and privileged roles require care.

Reuse: Account terms/quotas must be checked.

Next: Test user/moderator/partner/public permissions including graph joins and private caches.

## [E04] Codex worktrees

https://developers.openai.com/codex/app/worktrees/

Status: **documentation_checked**. Worktrees support independent parallel chats/checkouts in a Git repository.

Reuse: Official page redirects to ChatGPT Learn worktrees documentation.

Next: Use one branch/worktree per task, a shared contract commit and an integration owner.

## [S01] UN SDG 11

https://sdgs.un.org/goals/goal11

Status: **page_read**. Target 11.7 concerns safe, inclusive, accessible public spaces.

Reuse: Cite UN target text.

Next: State alignment of intent, not measured reduction in harm.

## [S02] UN SDG 5

https://sdgs.un.org/goals/goal5

Status: **page_read**. Target 5.2 concerns violence against women and girls.

Reuse: Cite UN target text.

Next: Keep user-centred focus without declaring causal impact.
