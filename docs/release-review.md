# Streetwise Safety release review

Review date: 12 September 2026.

Three independent agents reviewed the server, data collectors, and interface in separate worktrees.
A second review checked the internal places package and public API boundary.

## Fixed findings

| Priority | Finding | Change |
| --- | --- | --- |
| P1 | One failed source cleared all area results. | Keep successful results and show separate unavailable states with retry. |
| P1 | Invalid acquisition input could retain old acquired coverage. | Replace invalid projections with blocked coverage. |
| P2 | Withdrawal failed at revision or notification limits. | Permit terminal redaction and preserve correction delivery. |
| P2 | Evicted submission keys allowed duplicate reports. | Retain creation keys within the bounded session ledger. |
| P2 | Context redirects could attribute unrelated pages to reviewed sources. | Require the reviewed final URL and retain final URL provenance. |
| P2 | Area tabs lacked keyboard behavior. | Add arrow keys, Home, End, and linked panels. |
| P2 | Mobile utility controls were 32 pixels high. | Use the project 48 pixel target. |

## Publication boundary

Public area pages read official source cards and acquisition coverage without login, GPS, or session storage.
They expose no private reports, raw acquisition records, internal places projection, or fictional community feed.
Public writes are rejected. Invalid areas and unavailable sources remain explicit.

The report workflow is a fictional, session-isolated demonstration.
Hosted reports require separate database setup and an invitation code.
No live public intake, external sending, or Nextdoor personal dataset is enabled.

## Dataset limits

The police collection contains 108 monthly source files and 134,305 normalized source records.
The three research circles are not approved pilot boundaries. These counts are not pilot crime totals.
Read `docs/dataset-inventory.md` for the area breakdown and source limits.

## Deployed runtime check

The first deployment returned HTTP 500 because native Node ESM rejected extensionless server imports.
Server imports now use explicit JavaScript paths. JSON imports specify their type.
`npm run test:server` compiles and loads the server with native Node, without development module loaders.
It checks all three public dataset routes and the private storage gate.
