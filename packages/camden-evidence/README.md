# Camden evidence study

This module compares five real Police.uk rows with five separate fictional accounts.
The display does not establish a matching incident.

## API

- `policeSelection` validates `research/camden-evidence/police-records.json` at module load.
- `reportingSources` validates `research/camden-evidence/reporting-sources.json` at module load.
- `fictionalScenarios` contains five explicitly synthetic, unverified accounts.
- `buildCaseGraph(exampleId, state)` returns a validated graph for one example.
- `state` accepts `original`, `corrected`, or `withdrawn`.
- `CamdenEvidence` from `src/CamdenEvidence.tsx` accepts an optional `onExit` callback.

The graph contains at most seven nodes and six assertions.
Public source nodes retain source families, retrieval times, and available snapshot hashes.
Assertions retain precision, time intervals, methods, evidence references, revision, and unknown independence.
The study area represents broad display context. It does not establish membership within an exact boundary.
There are no person nodes or relationships that claim a matching incident.

Correction changes the fictional observed time and revision. It preserves the report submission time and public summary meaning.
Withdrawal removes fictional nodes and assertions from the projection. Real source nodes remain unchanged.
Controls save the study revision in the isolated demonstration session. Reloading retains the saved state.
The semantic graph stores the selected source records and current fictional study projection in PostgreSQL.
The public projection includes genuine source nodes. Fictional study nodes require the demonstration session.
The deliberate report action copies a fictional example into private review. It does not create an immediate public notice.
Study correction controls change the exercise. Submitted reports use the separate report review and withdrawal controls.
Sessions expire after 24 hours. These controls do not edit real police records or notify external services.

## Stored study API

- `GET /api/camden/examples` returns the saved study revision and five example states.
- `PATCH /api/camden/examples/:id` requires `expectedRevision` and the next `state`.
- `POST /api/camden/examples/:id/report` requires `expectedRevision` and `Idempotency-Key`.
- `GET /api/graph?area=camden_town` reads the bounded stored demonstration projection.
- `GET /api/graph/export?area=camden_town` exports its current Graphify-compatible snapshot.

These endpoints retain the existing hosted demonstration access gate. A failed request does not fall back to local state.

## Checks

Run `npx vitest run tests/camden-evidence` and `npm run check`.
Browser checks must use the page entry supplied by the integration task.

## Limits

Police records provide a reporting month and anonymised location. They do not disclose the exact incident, people, or evidence collected.
The combined category cannot distinguish sexual assault from common assault or battery.
The five rows are a purposive research sample. They are not representative of all incidents in Camden.
September area notices cannot confirm July events. Published schedules do not confirm current deployment.
The fictional intake detail is demonstration content, never a private real report.
