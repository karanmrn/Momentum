# Descriptive research controls

The research workspace uses `?workspace=analysis`. Choose the fictional moderator through the existing persona control first.

Real-data status returns `insufficient_comparable_data`. Comparable community history and reviewed pilot boundaries remain unavailable.

Fictional runs store the registered question, exact monthly inputs, source versions, method, diagnostics, and review status. Each run is private to its demo session. The API accepts one fixed fictional fixture per pilot. It rejects arbitrary observation tables and extra query slices.

The calculation uses average ranks for ties. It reports a Spearman coefficient only after measurement checks pass. It requires at least 24 common months and 80 percent coverage. These are design gates, not proof of statistical validity. Constant, sparse, copied, unknown-lineage, and incompatible measurements fail closed. Missing counts stay null.

The API does not publish empirical results, significance tests, confidence intervals, or personal risk estimates. Approval admits a fictional result to the demonstration review state only.

Run the reproducible offline example:

```sh
npx tsx scripts/analysis/run.ts camden_town /tmp/momentum-fictional-analysis.json
```

Verification: `npx vitest run tests/analytics` passed 12 domain and HTTP tests. `npx playwright test tests/e2e/analysis.spec.ts --reporter=line` passed at 390 and 1440 pixels. Tests cover private session isolation, concurrent writes, retry replay, review conflicts, reload persistence, export, and viewport width.
