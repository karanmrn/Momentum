# PubMax reuse

The place package adapts two existing PubMax features:

- Name search ranks exact, word-prefix, and substring matches.
- Attribute states keep missing evidence separate from stated absence.

Source repository: https://github.com/Singularityszn/pubmax

Source commit: `e9a412be1bb6c3280102f15fca924cae566f5b61`.

Source files: `lib/ukBasePubSearch.ts` and `lib/venueTruth.ts`.
The repository owner requested this adaptation. No private source datasets were copied.

## Dataset checks

The existing OSM acquisition contains 160 records across three research circles.
Hounslow has 19 records. Camden has 104 records. West Croydon has 37 records.
All three saved files match their recorded SHA-256 hashes.
Each file has unique OSM element keys.

These circles are not approved pilot boundaries.
The package retains `publicationAllowed: false`.
Raw records remain in the ignored dataset directory.

## Changes from PubMax

Exact OSM values replace permissive yes/no prefix matching.
Conditional values remain unknown. Limited access remains distinct.
Search has bounded queries and pages. It restricts results to the selected area.
Source revisions and original timestamps remain attached to each place.
Map centres do not become entrance coordinates.
Opening hours remain source text. Current availability remains unknown.
No place becomes a verified help location through this projection.

## Integration

Import the place projection, attribute parser, and search from `packages/places/src/index.ts`.
Use the existing OSM collector output as the projection input.
Keep missing or invalid input separate from a valid empty result.
Apply publication review before exposing research records through a public route.
Render names and source tags as text.
Keep place discovery separate from the council help directory.
An accessible list should remain usable when map tiles fail.

This package does not add a public route or change the current website.
The release task owns those paths.

## Validation

The full suite passed: 243 tests across 30 files, including 89 new place tests.
Type checking passed with `npm run check`.
A direct integration check validated all 160 saved records and paged through every record.
The integration check retained `publicationAllowed: false` for each area.

## Review lesson

Small PubMax functions transfer well when their evidence rules remain explicit.
Its permissive attribute parser and opening-hours shortcuts do not fit this application.
The destination collector already preserves stronger provenance than the PubMax normalizer.
