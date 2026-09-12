# Agent instructions — three-area local safety application

Read the current `generalist.md`, shared contracts and your assigned thread prompt before changing code. These instructions concern the safety project only; preserve unrelated existing repository instructions and code.

## Scope

Hounslow town centre, Camden Town centre and West Croydon. No SAY IT mental-health workflow, Westminster-first ranking or London-wide expansion. Community participation, source-aware knowledge graph, explicit personalisation and correction-aware notices are core.

## Work discipline

Inspect repository state first. Work on your assigned branch/worktree. Use a shared base commit and scoped paths. Thread 00 owns common contracts, migrations, root manifests/lockfile and deployment environment configuration. Do not resolve a dependency by silently editing another thread's files. Request a versioned contract change.

Never reset/delete unrelated user work. Do not expose credentials. Do not change paid plans, production databases, live alert subscriptions or public deployments without explicit authorisation. Document blocked permissions/credentials rather than fabricate results.

## Domain invariants

Historical police records are not live warnings, public street IDs are not police case references, and approximate geography cannot confirm an individual community claim. Relation candidates are not truth. Statistical coefficients are not probabilities of personal harm. Account status, review and source authority are separate dimensions.

Never add offender identity/association graphs, face recognition, sensitive movement history or protected-attribute risk inference. Do not scrape private feeds or restricted partner intelligence. No automatic official-report submission, alert to police, or external sending without the user's deliberate supported action.

## Engineering

Use runtime schema validation, explicit types, parameterised queries, bounded inputs/jobs, source timestamps, revision/idempotency controls and tested RLS. Guard public graph traversals and all projections/caches. Keep raw private reports out of telemetry and model prompts. Render content as text. Source freshness failures must not become all-clear states.

Synthetic fixtures and demo subscriptions are isolated and visibly labelled. Never make synthetic crime counts/correlations appear live. Preserve current source limitations and insufficient-data states. Public intake/push/AI stay gated until the documented reviews and operational tests pass.

## Definition of done

Functional implementation in assigned scope; tests added and actually run when available; changed paths and actual commands/results reported; important limitations/blocked dependencies documented; source provenance and public/private boundaries retained; clean integration instructions. A written plan or mocked screenshot alone is not completion.

## Context.dev

Use `services/context-dev.ts` for all Context.dev calls. Keep its API key server-only.
The wrapper uses `GET /web/scrape/markdown`. Read https://docs.context.dev/api-reference/web-scraping/markdown before changes.
Use mocked responses in automated tests. Live paid validation requires explicit authorisation.
