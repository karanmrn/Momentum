# Census resident context

Run from the repository root:

```sh
node --import tsx scripts/datasets/ons/index.ts
```

The command downloads six actual Census 2021 TS001 rows from the official Nomis API.
Each pilot uses its research anchor to find the nearest postcode within 100 metres.
Postcodes.io provides that postcode's explicit 2021 LSOA and MSOA codes.
Nomis returns the usual-resident count for each full statistical area.

These counts do not describe approved pilot polygons. The lookup does not establish anchor containment within a statistical boundary.
Do not add LSOA and MSOA counts. Their areas overlap.
Resident counts are not current population, visitor counts, night-time footfall, or a pilot crime-rate denominator.

Raw responses remain under ignored `.data/datasets/ons/`, with file permissions `0600`.
The reviewed manifest is `research/datasets/ons-status.json`. It records query URLs, period, checksums, actual counts, and limits.
A failed collection replaces the manifest with an unavailable state. Old files remain historical evidence only.

No API key, paid service, database, public endpoint, or live alert is required.

Official documentation:

- https://www.nomisweb.co.uk/datasets/c2021ts001
- https://www.nomisweb.co.uk/api/v01/help
- https://www.nomisweb.co.uk/home/copyright.asp
- https://postcodes.io/docs/postcode/schema/
