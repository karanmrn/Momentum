# Research findings and verification boundary

## Inputs and precedence

The user's latest instruction selects Hounslow town centre, Camden and West Croydon and requires community participation, an evidence knowledge graph, individual preferences and comparison with official datasets. It supersedes the older West End selection and the abandoned SAY IT mental-health idea. Camden is provisionally interpreted as Camden Town centre. Preserve prior documents as background, not competing implementation requirements.

The supplied Grok `v0-research.md` reports borough rankings and source paths but does not contain the raw CSV/workbook. Earlier review checked arithmetic, not independent extraction. Those borough numbers are not needed to choose these user-selected pilots and must not become Camden Town, Hounslow centre or West Croydon figures. The previous plan's separation of current notices, help locations, community reports and historical records remains useful.

## Findings from independent web research

Hounslow has a council data hub and a Hounslow Highways public fault-reporting site. The useful candidate enrichment is lighting/pavement issues; reuse and the exact read-feed contract still require validation. Do not count the council's republished police statistics as another independent witness.

Camden has the strongest immediately discoverable help and asset data: a Safety Bus schedule, Safe Havens scheme and street-lighting inventory. An inventory does not show whether a lamp works now. The bus page lists Friday/Saturday 21:30–02:30 outside Camden Town station; date-specific deployment remains unconfirmed. Older hub/bus articles must not overwrite current information.

West Croydon's plausible partner is Croydon BID's ranger operation. Its Radio Link is not a public intelligence API. Council lighting-reporting routes exist, but a public reporting form is not proof of a licensed bulk read service. No partner has authorised this project to use private operational or police data.

Police.uk's live metadata returned July 2026 as latest street reporting month through the web tool. The MPS catalogue lists a different cadence by geography. No pilot crime totals or per-area correlations were computed here. Exact pilot polygons and official station IDs remain implementation work.

The runtime's ten direct HTTP research probes failed because network requests were unavailable. `endpoint_probes.json` preserves the actual failures. Web page/documentation reads are a separate research channel. Do not treat these failures as proof the public services are down, and do not describe the connectors as tested.

## Design recommendations, not externally established facts

Use a Postgres/PostGIS evidence graph, private user preferences, domain-specific relationship types, deterministic eligibility and explainable ranking. Reserve cross-source statistical association for sufficiently comparable historical data, separate from event matching. Start with a reusable three-area configuration and one working end-to-end journey. These are proposed engineering decisions; user demand, staffing and product effectiveness remain hypotheses.

## Explicitly unresolved

- Reviewed polygons, geography vintages and real station/facility IDs.
- Actual downloaded police records, category mapping, snapshots, coverage and calculations.
- Camden dataset row schema, licence and update metadata; Socrata endpoint paths are candidates.
- Hounslow/Croydon civic-feed API terms, permissions, coverage and repair semantics.
- Local partners, moderator availability, help-site operational status and assisted languages.
- Sponsor credits, platform quotas, deployed costs, legal bases and service regulatory scope.
- Any measured relationship between community reports and police-recorded incidents.

## Exclusions

No Nextdoor/private-feed scraping, police case-number matching from public street IDs, identity or offender graph, face recognition, public victim location, deprivation-based personal danger scoring, or reintroduced mental-health product. General official emergency/reporting signposts remain appropriate.
