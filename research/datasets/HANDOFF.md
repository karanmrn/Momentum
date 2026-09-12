# Three-area dataset handoff

Collection date: 12 September 2026.
Areas: Hounslow town centre, Camden Town centre, and West Croydon.

## What is complete

The collectors downloaded actual records. They did not stop at source discovery or publication metadata.

| Dataset | Actual acquisition | Geography | Application visibility |
| --- | --- | --- | --- |
| Police.uk street records | 108 monthly files, August 2023 to July 2026 | One-mile source circles around three research anchors | File coverage only; crime totals remain unpublished |
| TfL Unified API | Five station groups, 43 group/child nodes, 29 line-status objects | Selected stations and their serving lines | Dated acquisition coverage |
| DfT NaPTAN | 12 selected transport references from 26,664 downloaded rows | Selected station and interchange access points | Static reference coverage |
| ONS Census 2021 through Nomis | Six statistical-area population rows | One LSOA and one MSOA near each anchor | Census period and geography coverage |
| OpenStreetMap / Overpass | 160 selected map records | One-mile research circles | Internal collection only |
| Police.uk neighbourhood priorities | Nine published issue/action pairs | Police neighbourhood containing each research anchor | Priority collection coverage |
| Independent recent community observations | Not collected | No genuine local observation dataset yet | Explicit missing-data state |

These are different geographic units. They cannot be compared as if they describe the same footprint.
The Census lookup selects the nearest postcode. It does not verify anchor containment through a boundary overlay.
The police source circles are research scopes. No pilot boundary was approved during collection.
Census resident counts are not current population, night-time footfall, or valid denominators for these police circles.

## What police data means

Street records include categories and available outcome categories, with month-level timing and anonymised locations.
They do not provide a complete account of police activity or exact crime scenes.
Their public record identifiers are not police case references.
Multiple records at one anonymised location remain distinct.
Missing identifiers do not cause records to disappear.

The priorities API publishes issues and action text together.
The internal evidence export preserves that source-stated relationship.
Action text can describe planned activity. A published action date does not prove completion.
A police-published issue is not an independently collected community report.

## Raw and normalized storage

Raw responses remain in the ignored `.data/datasets/` directory of the acquisition worktree.
They are not included in commits or browser bundles.

- `police/<pilot>/<month>.json`: original response bytes.
- `police/<pilot>/<month>.manifest.json`: request scope, source hash, and internal counts.
- `police/manifest.json`: complete acquisition results and failures.
- `police/evidence.jsonl`: normalized internal historical records.
- `police/.normalization.json`: normalization counts and output checksum.
- `tfl/`: original search, station, line-status, and NaPTAN responses.
- `tfl/selected-tfl.json`: reviewed transport identity selections and dated status responses.
- `ons/`: raw postcode lookups and the official Census CSV.
- `priorities/`: raw priority responses and internal evidence nodes/edges.
- `osm/`: filtered public amenity records, with contributor metadata removed.

All 108 police files passed SHA256 checks.
The normalized police store contains 134,305 source records.
These are collected source rows, not approved pilot crime totals.
The dataset suite passed 35 tests. The explicit scoped TypeScript check passed.
Normalized records retain source snapshot identity, source URL, month, category, precision, BTP provenance, and outcome status.
Stable IDs use source snapshot and row position. This preserves repeated rows and null source identifiers.
Internal priorities use `SOURCE_STATES_RESPONSE_TO`, with the same official source item as evidence.
No edge claims independent corroboration, event identity, personal danger, or causation.
Public publication and alert eligibility remain disabled for these records.

## Reproduction

Run these commands from the acquisition worktree with installed project dependencies:

```sh
node --import tsx scripts/datasets/police/collect.ts
node --import tsx scripts/datasets/police/normalize.ts
node --import tsx scripts/datasets/ons/index.ts
node --import tsx scripts/datasets/tfl/index.ts
node --import tsx scripts/datasets/tfl/live.ts
node --import tsx scripts/datasets/priorities/collect.ts
node --import tsx scripts/datasets/osm/index.ts
node --import tsx scripts/datasets/build-coverage.ts
```

Read each collector before a rerun. The police collector resumes verified local snapshots.
A resume is not a fresh source revision check.
To collect newer source revisions, preserve the previous collection and use a new internal output directory.
Do not run concurrent collectors against the same output directory.
Requests have fixed source hosts, response limits, timeouts, and bounded retries where implemented.
Police HTTP 429 stops further acquisition. Respect its retry delay.
TfL requests use a truthful application User-Agent. No credentials, proxy, or browser impersonation was used.

## Visible integration

`packages/datasets/src/coverage.ts` exports `getDatasetCoverage(pilotId)`.
It exposes only dated, validated acquisition metadata.
`packages/datasets/src/project.ts` rebuilds coverage from collector results.
Missing or invalid collection results produce blocked cards. They do not retain old acquired status.
The community card uses an empty source URL because no genuine source dataset is connected.
The interface must hide its source link.

The integration task connected `GET /api/datasets` and six expandable coverage cards for each area.
OpenStreetMap collection is internal and is not part of those six cards.
Its browser test checks source-file units, dates, geography, community gaps, and failure/retry states.
Detailed records remain internal. Downloading a source does not automatically publish it.

## Remaining dataset work

1. Review the exact pilot boundaries and station approaches.
2. Obtain genuine permitted community observations, with source times, corrections, and review status.
3. Implement a reviewed mapping between source geographies before statistical comparison.
4. Define source freshness and operational refresh rules before presenting transport snapshots as current.
5. Review public disclosure rules and TfL reuse terms before publishing detailed source records.
6. Collect longer independent community history before estimating statistical associations.

No current community-to-police overlap percentage was calculated.
No causal explanation was inferred from proximity or matching months.
MPS aggregate downloads remain a separate optional source. They must not be added to overlapping Police.uk counts.
