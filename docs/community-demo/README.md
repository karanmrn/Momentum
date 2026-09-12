# Original community scenarios

This dataset contains six fictional contributor labels and fifteen original scenarios.
Each pilot has five scenarios: sexual harassment, sexual violence, violence, hateful remarks, and environmental access.
No text, identity, image, or contact detail was copied from a social network.

The source data is `packages/community-demo/fixtures.json`.
The package validates all records before running a scenario.
Contributor labels are fixture metadata. They are not user accounts or authentication principals.
The runner uses the existing Alex, Sam, and moderator demonstration roles.

## Run

Run these commands from the repository root:

```sh
npx tsx packages/community-demo/run.ts
npx vitest run tests/community-demo
npm run check
```

The runner uses a new in-memory domain state for each scenario.
It does not contact a website, send a message, or write to a live database.

## Scenarios

All descriptions are non-graphic and use approximate public areas.
Sexual violence scenarios remain private and proceed directly to withdrawal.
They have no public notice, share preview, or public graph.

Other scenarios demonstrate private intake, publication review, a share preview, correction, and withdrawal.
Publication approval does not confirm that an incident occurred.
The share preview reads the current notice revision. It does not send content externally.
Graph edges explain source and approximate place relationships.
The graph does not identify alleged offenders or connect community claims to police cases.

These records cannot support crime counts, community membership totals, or claims about actual local conditions.
They must remain marked as fictional when displayed or exported.

## Integration boundary

This package adds executable scenarios and validated fixture data.
It does not change the public interface, server routes, or production user accounts.
The integration task owns any later interface or server connection.
Private intake and public sharing require separate authorisation checks in any later integration.

## Verification

Eighteen focused tests passed, including all fifteen scenario journeys.
TypeScript validation and formatting checks passed.
The CLI completed all fifteen scenarios with six authors, three private cases, and twelve reviewable cases.
Every result denied pre-review sharing and ended with a withdrawn, redacted report.
These checks exercise the existing domain in memory. They are not browser or hosted-service tests.

## Retrospective

Original fixtures can test sensitive workflows without collecting real disclosures.
Keep fictional author labels separate from authentication roles and keep share references separate from copied content.
