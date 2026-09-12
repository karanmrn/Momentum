# ONS anchor geography

This module verifies research anchors against official Census 2021 statistical boundaries.
It does not estimate the population of a pilot circle.

## Run

```sh
node --import tsx scripts/enrichment/ons-geography.ts
npx vitest run tests/enrichment/ons-geography.test.ts
npm run check
```

The collector writes `research/enrichment/ons-geography.json` atomically.
Raw responses remain in ignored `.data/enrichment/ons-geography/` directories with mode 0600.
The existing ONS acquisition and manifests remain unchanged.

## Consume

```ts
import data from "../../research/enrichment/ons-geography.json";
import { onsGeographySchema } from "./ons-geography";

const validated = onsGeographySchema.parse(data);
const observations = validated.observations.filter(
  (item) => item.pilotId === pilotId,
);
```

`getOnsAreaObservations(input)` provides the same validated observation array.
The exported types are `OnsAreaObservation`, `OnsGeographyDataset`, `BoundaryFeature`, and `BoundaryGeometry`.

Each observation has one `pilotId` and one `level`, either `LSOA` or `MSOA`.
`selectedPostcodeArea` retains the earlier lookup target for comparison.
`containingArea` is present only when containment is verified outside the ambiguity buffer.
`population` gives the whole containing area's Census Day count and its independent source evidence.

| Field                  | Values                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `status`               | `verified_containment`, `boundary_ambiguous`, `no_containing_area`, `source_unavailable` |
| `selectedAreaRelation` | `inside`, `outside`, `boundary_ambiguous`, `unknown`                                     |
| `selectionComparison`  | `matches_postcode_target`, `differs_from_postcode_target`, `unknown`                     |
| `population.status`    | `available`, `unavailable`, `not_applicable`                                             |

Top-level `status` is `verified` only when all six observations have verified containment and population data.
`partial` means one to five complete observations. `unavailable` means no complete observation.
Inspect individual statuses to distinguish geometry success from population failure.

Never substitute the selected postcode area's population when `containingArea` is null.
Never sum LSOA and MSOA counts. The statistical areas overlap.
`pilotPopulation` stays null. `crimeRateDenominatorEligible` and `alertEligible` stay false.

## Method and precision

The official LSOA BFC V10 and MSOA BFC V7 products describe boundaries at 21 March 2021.
Their titles use December 2021. Their metadata specifies Census Day geography.
Both retain full resolution and clip coastlines at mean high water.
The source CRS is EPSG:27700. ArcGIS returns requested GeoJSON in EPSG:4326, longitude first.
No simplification parameter is sent.

The collector first fetches polygons for the six existing statistical area codes.
A local ray-crossing calculation tests the anchor against outer rings and holes.
Multipolygons retain separate islands. Malformed, truncated, duplicate, and unexpected-CRS responses fail validation.
If an anchor falls outside its selected area, a bounded envelope query retrieves alternative candidates.
A unique containing polygon supplies the code for a bounded Nomis TS001 population query.

A point within 10 metres of any candidate boundary remains ambiguous.
This conservative buffer covers four-decimal anchor rounding and local projection uncertainty.
Its segment distances use a local metric approximation. They are not survey measurements.
Overlapping candidate polygons also remain ambiguous.
Known boundary ambiguity requires no further search because a population assignment remains unsupported.

Requests use fixed official service paths, reject redirects, and enforce a 4 MiB response limit.
Each request has a 30-second timeout. Only HTTP 429 or 503 gets one retry.
Provider cooldowns over two seconds end the request without an early retry.
A failed run replaces current coverage with explicit unavailable observations.
It never retains an old success under a new check timestamp.

## Sources

- [ONS LSOA metadata](https://www.arcgis.com/sharing/rest/content/items/2bbaef5230694f3abae4f9145a3a9800/info/metadata/metadata.xml?format=default&output=html)
- [ONS MSOA catalogue](https://www.data.gov.uk/dataset/b9d6e8eb-95a8-4a32-832f-e8a746252f43/middle-layer-super-output-areas-december-2021-boundaries-ew-bfc-v7)
- [ArcGIS query documentation](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/)
- [ONS boundary licences](https://www.ons.gov.uk/methodology/geography/licences)
- [Nomis TS001](https://www.nomisweb.co.uk/datasets/c2021ts001)

Source: Office for National Statistics licensed under the Open Government Licence v.3.0.
Contains OS data © Crown copyright and database right 2026.
Census counts remain subject to ONS statistical disclosure control.
