# Data enrichment

This release adds source context to the existing Camden evidence study.
The page is `/?enrichment=1&area=camden_town`.
The historical coverage panel links to it for each pilot.

## Acquired evidence

| Dataset | Actual result | Scope |
| --- | --- | --- |
| Police.uk outcomes | Five histories, six outcome entries | Exact public persistent IDs from the Camden sample |
| ONS boundaries | Five confirmed assignments, one ambiguous assignment | Research anchors and 2021 LSOA or MSOA boundaries |
| Census TS001 | Five confirmed population links | Whole statistical areas on 21 March 2021 |
| MPS recorded crime | 504 cells | Three boroughs, seven minor categories, 24 months |

CAM-02 has two outcomes in July 2026.
The outcome dates cannot establish their exact transition times.
The five police records still have unknown incident dates, narratives, victim genders, and assault subtypes.

The West Croydon anchor lies 4.8 metres from the selected LSOA boundary.
The method uses a 10-metre tolerance for the rounded research anchor.
That LSOA has no assigned population in the new projection.
Its selected postcode area and boundary evidence remain available for review.

MPS cells cover September 2024 to August 2026.
They retain rape, other sexual offences, stalking and harassment, and other published violence categories.
They describe boroughs, not the three town centres.
Do not add these figures to Police.uk totals or use them to classify individual records.
Sexual-offence detail is withheld at LSOA level.
The CONNECT change after February 2024 limits comparisons with older extracts.

## Common format

`packages/enrichment/uniform.ts` defines version 1.0 metadata.
It preserves source family, source record, URL, snapshot hash, retrieval time, and source row position.
It also preserves observation precision, place identity, geography vintage, review status, and revision lineage.
Unknown fields remain null or use an explicit unknown state.

`getUniformEnrichment(pilotId, now)` returns bounded metadata for the page and graph adapters.
Source-specific values remain in their validated source records.
Use `policeOutcomeHistory`, `onsAreaContext`, and `mpsBoroughContext` for those values.
These exports come from `packages/enrichment/index.ts`.

The Camden metadata export contains 191 records:

- Five police records and six outcome entries.
- Two area population records and 168 borough cells.
- Five help listings and five acquisition coverage records.

The existing bulk datasets remain in private research storage.
Acquisition coverage does not imply that every bulk record appears in this bounded public view.
Existing TfL, NaPTAN, place, help, and police acquisition adapters remain authoritative.
London Maxxing supplies source links, not a combined evidence dataset.
Reused repository code does not create independent source evidence.

## Graph integration

Join outcome entries to police records through their validated expected persistent ID.
Keep repeated outcome entries, including entries in the same month.
Join population records to versioned statistical-area IDs.
Connect each statistical area to its research anchor only after verified containment.
Connect MPS cells to borough IDs as area context.
Do not attach borough statistics to an individual police incident.

Source family and originating claim are separate fields.
An unknown origin does not count as independent confirmation.
Use `currentEnrichmentRecords()` before projecting multiple revisions.
It selects the latest version and removes withdrawn records.
`sourceDiversity()` excludes private and fictional records.

The active Graphify task owns its shared schema and graph export endpoints.
This release supplies validated adapters without changing that schema.

## Community detail

`communityEnrichmentSchema` adds account basis, observation interval, uncertainty, submission time, behaviour, and participant roles.
It distinguishes evidence offered, obtained, and reviewed.
It also records consent, correction lineage, and withdrawal.
It excludes participant names and automatic legal classifications.

The page provides an original fictional exercise.
Correction replaces its current time metadata.
Withdrawal removes its graph projection.
The exercise stays in memory and resets on reload.
It does not create a real observation or police match.

Genuine reports remain private in this contract.
A consenting source and named review team are still needed for the first genuine pilot.
No new live intake, external sending, public grants, or hosted database changes are included.

## Collection and storage

Run the police outcome collector from the repository root:

```sh
node --import tsx scripts/enrichment/police-outcomes.ts
```

Run the ONS collector:

```sh
node --import tsx scripts/enrichment/ons-geography.ts
```

The ONS command returns exit 1 for partial coverage.
The current boundary ambiguity is an explicit partial result, not a fabricated success.

The MPS file required the official browser download.
Direct HTTP requests returned 403.
The importer validates a local file and its download manifest.
Read `packages/enrichment/mps-context.README.md` for its exact command.
Raw files remain under ignored `.data/enrichment/`.

`buildEnrichmentImportPlan(root)` creates three artifacts for the existing private `importArtifact()` API.
It yields 515 records: five histories, six geography observations, and 504 MPS cells.
All publication and synthetic storage flags remain false.
The local database test verifies repeat-import idempotency and private storage flags.
The existing storage migration and ownership remain unchanged.

## Validation

The full suite passed 511 tests across 54 files.
The focused enrichment suite passed 36 tests.
TypeScript and the production build passed.
An independent review checked lifecycle, privacy, source families, and source lineage.
Its reported findings were fixed and checked again.

Browser checks covered area selection, month selection, police selection, corrections, withdrawal, reset, and JSON download.
The exported Camden file contained 191 records, zero private records, and zero fictional records.
The 390-pixel and 320-pixel layouts had no page overflow.
Visible buttons met the 48-pixel height target.

## Primary sources

- [Police outcome API](https://data.police.uk/docs/method/outcomes-for-crime/)
- [ONS Census geography](https://www.ons.gov.uk/methodology/geography/ukgeographies/censusgeographies/census2021geographies)
- [Nomis Census TS001](https://www.nomisweb.co.uk/datasets/c2021ts001)
- [MPS borough crime catalogue](https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m)
- [Camden Safe Havens](https://www.camden.gov.uk/safe-havens)
- [London Maxxing resource directory](https://resources.londonmaxxing.com/)
