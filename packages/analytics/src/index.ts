import { z } from "zod";
import {
  pilotSchema,
  type DemoState,
  type PilotId,
} from "../../contracts/index.js";
import { DomainError } from "../../domain/index.js";

const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const label = z.string().trim().min(1).max(160);
export const seriesSchema = z
  .object({
    id: label,
    sourceFamilyId: label,
    originGroupId: label.nullable(),
    sourceVersion: label,
    pilotId: pilotSchema,
    geographyVersion: label,
    unit: z.literal("pilot_month"),
    taxonomyVersion: label,
    category: label,
    measure: z.literal("record_count"),
    synthetic: z.boolean(),
    values: z
      .array(
        z
          .object({
            month,
            count: z.number().int().min(0).max(1_000_000).nullable(),
            complete: z.boolean(),
          })
          .strict(),
      )
      .max(120),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.values.map((x) => x.month)).size !== value.values.length)
      ctx.addIssue({ code: "custom", message: "Each month must appear once." });
    if (value.values.some((x) => !x.complete && x.count !== null))
      ctx.addIssue({
        code: "custom",
        message: "Incomplete months must have null counts.",
      });
  });
export type Series = z.infer<typeof seriesSchema>;
export const questionSchema = z
  .object({
    id: label,
    title: label,
    pilotId: pilotSchema,
    geographyVersion: label,
    predictor: label,
    outcome: label,
    categories: z.tuple([label, label]),
    taxonomyVersions: z.tuple([label, label]),
    period: z.object({ from: month, to: month }).strict(),
    minimumPeriods: z.number().int().min(24).max(120),
    exclusions: z.array(label).min(1).max(10),
    negativeControl: label,
    inferencePlan: z.literal("descriptive_only"),
    missingData: z.literal("pairwise_complete_no_interpolation"),
    multiplicityHandling: z.literal(
      "one_prespecified_comparison_no_significance",
    ),
    permittedInterpretation: z.literal("sample_association_only"),
  })
  .strict()
  .refine((q) => q.period.from <= q.period.to, "The period must be ordered.");
export type ResearchQuestion = z.infer<typeof questionSchema>;
export interface AnalysisResult {
  status:
    | "insufficient_comparable_data"
    | "ineligible_measurement"
    | "descriptive_result";
  researchQuestionId: string;
  sourceSeriesIds: string[];
  sourceVersions: string[];
  period: { from: string; to: string };
  unit: "pilot_month";
  methodVersion: "spearman-average-ties-v1";
  nCommonPeriods: number;
  missingness: {
    expected: number;
    predictor: number;
    outcome: number;
    paired: number;
  };
  estimate: number | null;
  interval: null;
  pValue: null;
  diagnostics: string[];
  distributions: { predictor: Distribution; outcome: Distribution };
  multiplicityHandling: string;
  limitations: string[];
  reviewStatus: "unreviewed" | "approved_demo" | "rejected";
  generatedAt: string;
  synthetic: boolean;
}
interface Distribution {
  n: number;
  zeroCount: number;
  min: number | null;
  max: number | null;
  distinct: number;
}
export interface AnalysisRun {
  id: string;
  question: ResearchQuestion;
  inputs: [Series, Series];
  result: AnalysisResult;
  reviewNote: string | null;
}
export interface AnalyticsState {
  revision: number;
  runs: AnalysisRun[];
}
export const readAnalytics = (state: DemoState): AnalyticsState =>
  structuredClone(state.analytics ?? { revision: 1, runs: [] });
const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
  Number(to.slice(5)) -
  Number(from.slice(5)) +
  1;
const distribution = (xs: number[]): Distribution => ({
  n: xs.length,
  zeroCount: xs.filter((x) => x === 0).length,
  min: xs.length ? Math.min(...xs) : null,
  max: xs.length ? Math.max(...xs) : null,
  distinct: new Set(xs).size,
});
function ranks(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value)
      end++;
    for (let i = start; i < end; i++)
      out[sorted[i].index] = (start + 1 + end) / 2;
    start = end;
  }
  return out;
}
export function analyse(
  questionInput: unknown,
  predictorInput: unknown,
  outcomeInput: unknown,
  now = new Date(),
): AnalysisResult {
  const q = questionSchema.parse(questionInput);
  const a = seriesSchema.parse(predictorInput);
  const b = seriesSchema.parse(outcomeInput);
  const inPeriod = (s: Series) =>
    s.values.filter(
      (v) =>
        v.month >= q.period.from &&
        v.month <= q.period.to &&
        v.complete &&
        v.count !== null,
    );
  const av = new Map(inPeriod(a).map((v) => [v.month, v.count!]));
  const bv = new Map(inPeriod(b).map((v) => [v.month, v.count!]));
  const common = [...av.keys()].filter((m) => bv.has(m)).sort();
  const x = common.map((m) => av.get(m)!);
  const y = common.map((m) => bv.get(m)!);
  const expected = monthsBetween(q.period.from, q.period.to);
  const da = distribution(x);
  const db = distribution(y);
  const result: AnalysisResult = {
    status: "ineligible_measurement",
    researchQuestionId: q.id,
    sourceSeriesIds: [a.id, b.id],
    sourceVersions: [a.sourceVersion, b.sourceVersion],
    period: q.period,
    unit: "pilot_month",
    methodVersion: "spearman-average-ties-v1",
    nCommonPeriods: common.length,
    missingness: {
      expected,
      predictor: expected - av.size,
      outcome: expected - bv.size,
      paired: expected - common.length,
    },
    estimate: null,
    interval: null,
    pValue: null,
    diagnostics: [],
    distributions: { predictor: da, outcome: db },
    multiplicityHandling: q.multiplicityHandling,
    limitations: [
      "Monthly observations can depend on prior months.",
      "Reporting and coverage can affect both series.",
      "This result does not establish event identity, causation, or personal risk.",
      "The 24-month minimum is a design gate. It does not establish statistical validity.",
    ],
    reviewStatus: "unreviewed",
    generatedAt: now.toISOString(),
    synthetic: a.synthetic || b.synthetic,
  };
  if (expected > 120) result.diagnostics.push("period_exceeds_bound");
  if (
    !a.originGroupId ||
    !b.originGroupId ||
    a.originGroupId === b.originGroupId ||
    a.sourceFamilyId === b.sourceFamilyId
  )
    result.diagnostics.push("source_independence_not_established");
  if (a.synthetic !== b.synthetic)
    result.diagnostics.push("mixed_synthetic_and_empirical");
  if (
    a.pilotId !== q.pilotId ||
    b.pilotId !== q.pilotId ||
    a.geographyVersion !== q.geographyVersion ||
    b.geographyVersion !== q.geographyVersion
  )
    result.diagnostics.push("geography_mismatch");
  if (
    a.id !== q.predictor ||
    b.id !== q.outcome ||
    a.category !== q.categories[0] ||
    b.category !== q.categories[1] ||
    a.taxonomyVersion !== q.taxonomyVersions[0] ||
    b.taxonomyVersion !== q.taxonomyVersions[1]
  )
    result.diagnostics.push("registered_measurement_mismatch");
  if (result.diagnostics.length) return result;
  if (common.length < q.minimumPeriods || common.length / expected < 0.8) {
    result.status = "insufficient_comparable_data";
    result.diagnostics.push("insufficient_common_months");
    return result;
  }
  if (da.distinct < 3 || db.distinct < 3)
    result.diagnostics.push("constant_or_low_variability");
  if (da.zeroCount / x.length > 0.8 || db.zeroCount / y.length > 0.8)
    result.diagnostics.push("sparse_counts");
  if (result.diagnostics.length) return result;
  const rx = ranks(x),
    ry = ranks(y),
    mean = (x.length + 1) / 2;
  const numerator = rx.reduce(
    (sum, value, i) => sum + (value - mean) * (ry[i] - mean),
    0,
  );
  const denominator = Math.sqrt(
    rx.reduce((sum, value) => sum + (value - mean) ** 2, 0) *
      ry.reduce((sum, value) => sum + (value - mean) ** 2, 0),
  );
  result.status = "descriptive_result";
  result.estimate = Math.max(-1, Math.min(1, numerator / denominator));
  result.diagnostics.push("descriptive_only_no_significance");
  return result;
}
export function syntheticInputs(pilotId: PilotId): {
  question: ResearchQuestion;
  inputs: [Series, Series];
} {
  const question: ResearchQuestion = {
    id: "synthetic-process-comparison-v1",
    title: "Fictional monthly report process comparison",
    pilotId,
    geographyVersion: "fictional-pilot-v1",
    predictor: "fictional-submissions",
    outcome: "fictional-publications",
    categories: ["all_demo", "all_demo"],
    taxonomyVersions: ["demo-v1", "demo-v1"],
    period: { from: "2023-01", to: "2025-12" },
    minimumPeriods: 24,
    exclusions: [
      "Private narratives and personal identifiers",
      "Real police records and real community reports",
    ],
    negativeControl: "Prespecified reversed-order fixture in offline tests",
    inferencePlan: "descriptive_only",
    missingData: "pairwise_complete_no_interpolation",
    multiplicityHandling: "one_prespecified_comparison_no_significance",
    permittedInterpretation: "sample_association_only",
  };
  const create = (id: string, phase: number): Series => ({
    id,
    sourceFamilyId: id,
    originGroupId: id,
    sourceVersion: "invented-v1",
    pilotId,
    geographyVersion: question.geographyVersion,
    unit: "pilot_month",
    taxonomyVersion: "demo-v1",
    category: "all_demo",
    measure: "record_count",
    synthetic: true,
    values: Array.from({ length: 36 }, (_, i) => ({
      month: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      count: 10 + ((i * (phase + 3)) % 19) + Math.floor(i / 6),
      complete: true,
    })),
  });
  return {
    question,
    inputs: [create(question.predictor, 0), create(question.outcome, 2)],
  };
}
export function empiricalStatus(pilotId: PilotId) {
  return {
    status: "insufficient_comparable_data" as const,
    pilotId,
    estimate: null,
    interval: null,
    synthetic: false,
    reasons: [
      "No comparable real community history is available.",
      "Pilot boundaries require review before exact area analysis.",
    ],
    permittedSlice: "pilot_month",
    publicQueryEnabled: false,
  };
}
export function reviewAnalysis(
  state: DemoState,
  id: string,
  expectedRevision: number,
  decision: "approved_demo" | "rejected",
  note: string,
): AnalyticsState {
  const current = readAnalytics(state);
  if (current.revision !== expectedRevision)
    throw new DomainError(
      409,
      "conflict",
      "The analysis changed. Reload before review.",
    );
  const run = current.runs.find((r) => r.id === id);
  if (!run)
    throw new DomainError(404, "not_found", "The analysis was not found.");
  if (
    decision === "approved_demo" &&
    (!run.result.synthetic || run.result.status !== "descriptive_result")
  )
    throw new DomainError(
      400,
      "invalid_input",
      "Only eligible fictional runs can enter the demonstration view.",
    );
  run.result.reviewStatus = decision;
  run.reviewNote = note;
  current.revision++;
  state.analytics = current;
  return structuredClone(current);
}
