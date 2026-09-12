# UI and journey audit

Reviewed the live public app and an isolated local demo on 12 September 2026.
Initial base: `95a9a5c`. Integrated main: `fdd0e4b`. Visible product name: Momentum. The existing public URL remains unchanged pending domain verification.

## Fixed findings

| Finding | Correction | Evidence |
| --- | --- | --- |
| The 903px layout clipped the transport panel. | Stack narrow desktop panels; use shrinkable tracks on wider screens. | Browser screenshots and eight viewport checks. |
| Newly integrated evidence links touched. | Group links with wrapping and spacing. | Browser inspection and data-page navigation checks. |
| Tablet header controls overlapped. | Place the area selector on its own tablet row. | Rectangle checks at 821px, 903px, and 1024px, in public and demo modes. |
| Mobile Account appeared before the brand. | Keep the brand left and a compact Account control right. | 390px browser inspection and layout tests. |
| Community showed transport that never loaded. | Enable transport reads for that view. | Public journey regression. |
| Help briefly reported missing listings while loading. | Show loading until the request finishes. | Delayed response regression. |
| Help buried reporting routes beneath unrelated source metadata. | Add police, BTP, and street-problem routes; retain relevant local directories. | Browser inspection and destination assertions. |
| Cached transport could expire just after retrieval. | Schedule reads from response expiry; bound repeated failure retries. | Reproduced expired display and added timing regressions. |
| TfL repeated the same disruption explanation. | Group identical reasons while retaining each severity label. | Source and browser tests. |
| Failed reads after successful saves looked like failed writes. | Keep report, preference, moderation, and withdrawal outcomes visible. | Forced refresh failures in browser tests. |
| A lost report response could cause duplicate submissions. | Reuse the request key for unchanged input. | Actual successful POST with an interrupted response, followed by retry. |
| Background controls remained active behind dialogs. | Make background branches inert and retain modal focus. | Keyboard and pending-save checks. |
| Approved reports had no owner withdrawal control. | Permit withdrawal for every non-withdrawn report. | Approved-report withdrawal regression. |

Changed generic labels such as “Checking the current projection” to plain loading messages.
Source links now name their destination. Source dates, uncertainty, and fictional labels remain visible.

## Scope checked

- All three areas, public navigation, keyboard tabs, map/list switches, layers, zoom, place selection, and map failure.
- Account availability, signup confirmation, login, logout, retry, credential clearing, and mobile layout.
- Fictional scenario selection, form validation, submission, receipts, editing, conflicts, and withdrawal.
- Moderator decisions, preference saves, inbox correction journeys, and fictional research consent.
- Dataset disclosures, evidence refresh, and Camden example selection, correction, withdrawal, and reset.
- Sharing dialog, copy feedback, QR disclosure/download, presentation slides, and return navigation.

Browser automation uses isolated servers for core, public features, and mutations.
This prevents unrelated tests from exhausting the demo request budget. Product rate limits are unchanged.
Set `PLAYWRIGHT_BASE_PORT` when another task uses the default test ports.

## Validation

- `npm test`: 588 tests passed across 61 files.
- `PLAYWRIGHT_BASE_PORT=49325 npx playwright test --workers=1`: 65 tests passed before the final data-page merge.
- After the data-page merge: 20 affected browser tests passed.
- `npm run build`: passed.
- `npm run test:server`: passed.
- `git diff --check`: passed.
- Independent code review found no blockers.

These results include the new account controls, stored Camden evidence, Local updates page, and Data context integration.
GitHub Actions cannot run while account billing blocks jobs. Local validation results are reported separately.

## Limits

The public account service was unavailable during the live audit. Account success paths used controlled browser fixtures.
Private reports and moderator actions used fictional local data. No real reports, emails, or external shares were sent.
This audit does not establish real-user demand or guarantee that every device has no defects.
New features from other tasks require their own integration checks.

The help routes were checked against the Metropolitan Police reporting page and BTP's 61016 guidance.
- https://www.met.police.uk/ro/report/
- https://www.btp.police.uk/police-forces/british-transport-police/areas/campaigns/How-to-use-our-text-number/
