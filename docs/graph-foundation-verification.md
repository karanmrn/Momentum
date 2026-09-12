# Camden graph foundation verification

Date: 12 September 2026. Base: `95a9a5c`.

The Camden study previously used local component state. Its graphs were tables, without a connected visual network.
The study now persists in the existing isolated PostgreSQL session. Graph reads rebuild and store the current projection.
The public graph contains 36 nodes and 39 assertions. The demonstration contains 49 nodes and 53 assertions.
These include five police records, five help locations, two station identities, and six dataset coverage families.
Detailed datasets without reviewed record projections remain coverage metadata.

Graphify 0.9.58 analysed 102 nodes and 106 directed links in 17 communities.
Each qualified assertion becomes a separate node. This prevents parallel assertions from collapsing.
No model call ran. The exported snapshot contains no evidence confidence scores or personal harm scores.

## Commands and results

```sh
npm run check
npm run build
npm run test:server
npm test
npm run test:e2e -- --reporter=line
```

All checks passed: 444 unit and integration tests, and 41 browser tests.
Native ESM startup and the production build passed.
An independent disk-backed check closed and reopened PGlite. Study revision 2 and its graph remained unchanged.
Browser checks covered 320, 390, and 1440 pixels, keyboard controls, and selected details inside the viewport.
The stored Camden browser journey used actual HTTP routes. It verified correction, reload, private reporting, withdrawal, and export.

## Review fixes

Independent reviewers found and verified fixes for:

- Creation-key eviction that could duplicate a Camden report retry.
- Case assertions that could bypass qualification validation by changing their method label.
- Selected graph details that were far below the viewport.
- Source and assertion qualifiers missing from the shared inspector.

The report dialog also preserves successful receipts after list-refresh failure.
It freezes the selected area and prevents closure while a report save is pending.

## Deployment boundary

This verification used local isolated databases. It did not change a hosted database or deployment.
Apply `003_camden_graph.sql` after the two existing migrations before deploying these server changes.
Hosted study actions retain the existing invited demonstration gate.
Real report intake, external push, and public account reports remain closed.
No hosted CI result is claimed.

Offline graph downloads are snapshots. Download again after a correction or withdrawal.
