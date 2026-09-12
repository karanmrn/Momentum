# MPS borough context

This importer selects whole-borough historical counts for Camden, Hounslow, and Croydon.
It retains seven published minor categories under SEXUAL OFFENCES and VIOLENCE AGAINST THE PERSON.
Each selected series contains all 24 months in the downloaded file.

## Acquisition

Direct automated HTTP access returned 403 during source acquisition.
The original CSV was acquired through an official browser download from London Datastore.
This importer reads that local file. It does not claim to fetch the source over HTTP.

Keep the downloaded CSV and manifest outside public assets, for example in `.data/enrichment/mps/`.
The manifest requires the exact official download URL, browser acquisition method, retrieval timestamp, byte length, and SHA256.

Run:

```sh
node --import tsx scripts/enrichment/mps-context.ts .data/enrichment/mps/borough.csv .data/enrichment/mps/manifest.json
```

The importer writes `research/enrichment/mps-context.json`. It does not commit the complete source CSV.
Each selected cell retains its source row index, column index, original month column, source value, and snapshot hash.
Row indexes start at zero after the header. Column indexes start at zero with Group.
Stable cell IDs derive from the snapshot hash and row and column positions.

## Interface

- `importMpsBoroughCsv(bytes, manifest, importedAt?)` validates and imports a local snapshot.
- `mpsContextSchema` validates the saved dataset.
- `selectMpsBoroughContext(input, borough)` returns the 168 cells for one selected borough.
- Types: `MpsContext`, `MpsContextCell`, and `MpsBorough`.

Input limits: 2 MB, 5,000 source rows, 27 columns, and 300 characters per cell.
The importer rejects malformed quoting, missing columns, duplicate series, incomplete scope, and unknown selected categories.
Zero is a known count. Empty values and recognized missing markers remain null.
Negative, fractional, and unrecognized count values fail validation.

## Meaning

These are whole-borough counts. They are not town-centre, street, or personal safety measures.
Do not add them to Police.uk totals or use them to classify individual Police.uk records.
Do not infer suppressed LSOA sexual-offence counts.
The catalogue warns about comparisons across the February 2024 CONNECT transition.
Unknown source values remain unknown.

The source licence is Open Government Licence v2.0.
Catalogue: https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m

## Checks

Run `npx vitest run tests/enrichment/mps-context.test.ts` and `npm run check`.
Tests use generated CSV fixtures. They do not fetch live data.
