# Police outcome history

This adapter retrieves the published outcome history for each selected Camden Police.uk persistent ID.
It verifies returned crime ID, category, and reporting month before accepting any outcome.
The persistent ID links public records. It is not an internal police case reference.

## Interfaces

- `createPoliceOutcomeClient({fetch?, now?, timeoutMs?})` returns a single-record client.
- `collectPoliceOutcomes(expectedCrimes, client?, now?)` processes at most five distinct records.
- `normalizePoliceOutcomes(bytes, expectedCrime, fetchedAt)` validates and redacts a response.
- `policeOutcomeCollectionSchema` validates the saved collection for a page or graph adapter.
- `policeOutcomeResultSchema` validates one result.
- Types: `ExpectedCrime`, `PoliceOutcomeResult`, and `PoliceOutcomeCollection`.

Run `node --import tsx scripts/enrichment/police-outcomes.ts` to refresh the five selected histories.
The script reads `research/camden-evidence/police-records.json` and writes `research/enrichment/police-outcomes.json`.
It prints only example IDs, collection states, and outcome row counts.
It never writes or logs original response content.

## Source and identity controls

The sole request host and path prefix are fixed. The persistent ID must contain exactly 64 hexadecimal characters.
Requests reject redirects. Each response has a 256 KB byte limit, 500-outcome limit, and 15-second deadline.
Collection stops after HTTP 429. It records the retry delay and marks later requests unattempted.
It does not retry or bypass the rate limit.

The response hash describes original bytes. Persisted fields contain no person identifiers.
The parser selects category and month fields. It discards all other outcome fields before normalization.
Outcome IDs use the response hash and source array index. This preserves repeated rows.
Array order does not establish event order within a month.
Unknown category or date values remain null. No identity or event details are inferred.

Available empty history differs from unavailable history. Failures contain `outcomes: null` and unverified lineage.
A 404 does not show that no investigation or action occurred.
Results are historical police source statements. They cannot independently corroborate a community report.
The adapter does not create person nodes, alerts, or offence subtype classifications.

## Verification

Run `npx vitest run tests/enrichment/police-outcomes.test.ts` and `npm run check`.
Automated tests use mocked responses. They do not call the live API.

Source documentation: https://data.police.uk/docs/method/outcomes-for-crime/
