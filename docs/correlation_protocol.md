# Cross-source relationship and association protocol

## 1. Three different questions

**Record identity:** are these versions of the same explicitly identified source item?

**Event linkage:** do different observations plausibly describe the same real-world operational issue? This may be unresolved. Monthly approximate police records usually cannot answer it for an individual community submission.

**Statistical association:** across comparable places and periods, do two measurements move together? This does not establish event identity, causation, true crime prevalence, reporting accuracy, an offender link or police responsiveness.

The UI/API must request the intended question explicitly. Never expose one ambiguous “correlation with police: 85%” field.

## 2. What can be shipped immediately

- Counts by actual source category, approved geography and available month.
- Data-completeness and coverage matrix.
- Community report publication/withdrawal process measures, not crime rates.
- Candidate-link reason codes and reviewed status.
- An association endpoint returning `insufficient_comparable_data` when appropriate.
- Clearly isolated synthetic fixtures showing how the method operates, labelled as invented at every display and export.

There is no real community time series yet. The new app cannot claim a measured community–police correlation on launch day. Do not substitute three borough totals, duplicated cell-months or generated reports for evidence.

## 3. Register a research question before running numbers

Example exploratory question: “For matched coarse cells and months in one pilot, is the volume of published first-party infrastructure reports associated with recorded robbery counts?” This is not equivalent to asking whether poor lighting causes robbery. The claim might be poorly measured or not meaningful; test that first.

Record outcome, predictor, categories, period, source family, exclusions, geographic version, inference plan, handling of missing data, minimum-data eligibility, multiplicity adjustment and permitted public interpretation. Define a negative-control comparison and whether the exercise is descriptive or inferential.

## 4. Observation table

Grain: `(pilot_id, geography_version, cell_or_area_id, month, source_series, taxonomy_version)`.

Measures include unique eligible reports, police-recorded counts, dataset coverage flags, operational-source availability, amount of app exposure if measured with permission, and known reporting-policy changes. Keep asset inventories separate from fault counts. Keep force publication boundaries separate. A community report and a council record that originated from that report belong to one lineage family.

Time-series data are aligned by relevant observation interval, not scrape time. Historical reports backfilled later need explicit backfill rules. Null means missing/unavailable; zero means a successful and sufficiently complete observation of no records for the defined measurement. “No rows” alone cannot determine which is true.

## 5. Eligibility and descriptive output

Proposed configurable research gate: aim for at least 24 common monthly periods, ideally 36, with acceptable completeness and nondegenerate variability. This is a **design gate, not a universal sufficient sample size**. Statistical review can require more or decide that inference is unjustified. Multiple cells in a month do not make their values independent. Extremely sparse and suppressed counts may make even descriptive correlation inappropriate.

Compute pairwise availability first; do not interpolate missing crime or complaint counts. Show common periods, geography, observations, missingness and count distributions alongside any coefficient. A visually strong pattern with inadequate evidence should remain a hypothesis.

## 6. First statistical approach

Start with distributions and aligned plots. Spearman rank correlation can describe monotonic association without assuming a linear relationship [A01]. Return coefficient, declared sample unit, common period and limitations. Do not interpret `rho=0.6` as “60% of incidents are linked”, “60% risk”, or “the police validate 60% of reports”.

Ordinary p-values/permutations that assume independent samples are inadequate for autocorrelated months and nearby cells. Choose and justify temporal block resampling and spatial clustering, or limit the output to descriptive statistics. Bootstrap intervals are not automatic validity; enough blocks and an appropriate dependence model are required. Where several categories/lags are explored, document the family of tests and use an appropriate correction, such as a prespecified false-discovery-rate method. Never cherry-pick the highest coefficient.

Do not compute user-level crime probabilities. Do not run individual protected-attribute correlations or use police stops/searches as an underlying-criminality label.

## 7. Later model, only after measurement review

For sufficiently rich counts, a Poisson or negative-binomial panel model can be considered [A02]. A proposed form is:

`log(E[count_cell,month]) = cell_effect + month_effect + beta * measured_context + log(valid_exposure)`

The offset is permitted only when exposure measures the relevant population/process consistently. Resident population is not night-time pedestrian exposure; app active users are not the population at risk; raw footfall cannot automatically be treated as exposure for all offences. Omit an invalid offset instead of fabricating one. Assess dispersion, reporting changes, spatial dependence and held-out temporal performance.

A coefficient remains an association without a credible causal design. A before/after comparison of an infrastructure repair is not causal without handling confounding, selection and other changes. Research on policing feedback loops [A03] motivates explicit care about what is observed and who/how often reports it; it does not establish that this app has those measured effects.

## 8. Duplicate and independence rules

MPS borough/ward tables and Police.uk can describe overlapping underlying events. A council dashboard republishing MPS totals is not an independent series. Source agreement caused by copying or common measurement is not corroboration. Keep one primary series per comparison, source derivation lineage and category-resolution compatibility.

Police category `violence-and-sexual-offences` must not be relabelled as women victims or public-space harassment. Suppressed sexual-offence locations must not be reconstructed using community details. Boundary sensitivity analysis should demonstrate whether a result survives reasonable aggregation changes; never optimise boundary placement to maximise correlation.

## 9. Publication and privacy

Analyses stay internal until reviewed. Publish precomputed coarse slices with a disclosure review, not an unrestricted query API over small counts. A configurable low-count suppression rule alone does not prevent reconstruction from overlapping queries or successive snapshots. Apply complementary suppression/coarse summaries and restrict filter combinations as needed; record the policy. Exclude personally identifying narratives and coordinates.

Result schema: `status`, `research_question_id`, `source_series_ids`, `source_versions`, `period`, `unit`, `method_version`, `n_common_periods`, `missingness`, `estimate_or_null`, `interval_or_null`, `diagnostics`, `multiplicity_handling`, `limitations`, `review_status`, `generated_at`, `synthetic`.

## 10. Honest display examples

Good: “Not enough comparable history yet. Police counts are monthly; community collection began this month.”

Good: “Historical context overlaps in place and month; this does not establish that the records describe the same incident.”

Good after valid reviewed analysis: “A descriptive association was observed in the stated sample. Reporting behaviour and footfall may affect both measures; no causal conclusion.”

Bad: “Police confirmed this user's report”, inferred only from proximity.

Bad: “This road is 83% unsafe”, derived from a correlation coefficient.
