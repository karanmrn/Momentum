# Research verification

Verification date: 12 September 2026.

## Executed checks

- `vitest run tests/recruitment/recruitment.test.ts`: eight tests passed.
- `npm run check`: TypeScript passed.
- `RESEARCH_TEST_URL=http://127.0.0.1:4190 node tests/recruitment/browser.mjs`: passed against the integrated application.

The browser check submitted three fictional observations and displayed their eligible coverage count.
Withdrawal removed one observation and suppressed the remaining small count.
The check covered all three pilots, persona resets, keyboard order, and both mobile and desktop widths.
No browser page errors occurred.

An independent reviewer tested malformed consent, unknown fields, invalid dates, and input limits.
The reviewer also checked immutable state, owner isolation, withdrawal tombstones, and replay refusal.
No blocking module issue was found.

Visual inspection found a wrapped Research item in the shared mobile navigation.
The integration owner received the finding for correction in shared CSS.

## Limits

This verifies a temporary fictional exercise only.
It does not verify real community access, live participant consent, or production privacy controls.
It does not establish source coverage, crime patterns, or representative community findings.
External CI execution is reported by the integration task.

## Retrospective

Separate access metadata from evidence authority and consent.
Use structured fictional inputs to demonstrate the complete withdrawal path without collecting sensitive narratives.
Use accessible role locators for selects whose wrapping labels contain dynamic option text.
