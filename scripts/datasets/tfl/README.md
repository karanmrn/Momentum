# Transport source collection

Run these commands from the dataset worktree:

```sh
node --import tsx scripts/datasets/tfl/index.ts
node --import tsx scripts/datasets/tfl/live.ts
```

The first command downloads official DfT NaPTAN CSV for area codes 490, 910, and 940.
These codes cover London, national rail, and national tram records.
The official area selection page lists them: https://beta-naptan.dft.gov.uk/Download/La
The documented API supports area filtering: https://naptan.api.dft.gov.uk/swagger/index.html

The selection verifies exact source identifiers, names, stop types, active registration, and approximate vicinity.
Vicinity checks do not define pilot polygons. They cannot confirm pilot membership.
Selected NaPTAN data contains six station anchors and six West Croydon bus stops.
The download contains broader source rows. Keep raw files outside public assets.

The second command collects five named TfL station groups, their child stops, facilities properties, and serving line status.
West Croydon's group includes rail, tram, and bus station children.
Requests use the official Unified API and a truthful research client name.
Python's default client returned HTTP 403. Standard Node fetch succeeded without credentials, proxies, or browser impersonation.
A failed source request stops further requests in that run. No retry or polling loop exists.
Requests have 30-second deadlines and response size limits. No paid service is used.

TfL grouped IDs differ from NaPTAN ATCO codes. Keep the source namespaces separate.
Station facility properties do not confirm current working condition or staffing.
Line status applies to the whole line at retrieval time. It does not identify local danger.
Only the saved response timestamps support freshness claims. Do not display these files as a continuously live feed.

Raw responses and selected records are under `.data/datasets/tfl/`.
The manifest is `research/datasets/tfl-status.json`. It contains URLs, checksums, request times, counts, and limits.
No source adapter, graph endpoint, public notice, or deployment changes are included.

NaPTAN uses the UK Open Government Licence, as stated by its official data catalogue.
https://www.data.gov.uk/dataset/ff93ffc1-6656-47d8-9155-85ea0b8f2251/naptan

TfL uses separate transport-data terms. Attribution: Powered by TfL Open Data.
https://tfl.gov.uk/corporate/transparency/
https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service

The full TfL terms page timed out during review. Public publication remains disabled.
Tests use synthetic rows and perform no network requests.
