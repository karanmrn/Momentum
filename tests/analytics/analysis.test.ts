import { describe, expect, it } from "vitest";
import {
  analyse,
  empiricalStatus,
  questionSchema,
  reviewAnalysis,
  seriesSchema,
  syntheticInputs,
} from "../../packages/analytics/src";
import { createDemoState } from "../../packages/domain";
const fixture = () => syntheticInputs("camden_town");
describe("registered descriptive comparisons", () => {
  it("returns empirical insufficiency and no coefficient at launch", () => {
    expect(empiricalStatus("camden_town")).toMatchObject({
      status: "insufficient_comparable_data",
      synthetic: false,
      estimate: null,
    });
  });
  it("rejects three totals as sufficient history", () => {
    const { question, inputs } = fixture();
    inputs.forEach((s) => (s.values = s.values.slice(0, 3)));
    expect(analyse(question, ...inputs)).toMatchObject({
      status: "insufficient_comparable_data",
      estimate: null,
      nCommonPeriods: 3,
    });
  });
  it("rejects copied sources, unknown origins, and mixed empirical data", () => {
    for (const kind of ["origin", "family", "unknown", "mixed"]) {
      const { question, inputs } = fixture();
      if (kind === "origin") inputs[1].originGroupId = inputs[0].originGroupId;
      if (kind === "family")
        inputs[1].sourceFamilyId = inputs[0].sourceFamilyId;
      if (kind === "unknown") inputs[1].originGroupId = null;
      if (kind === "mixed") inputs[1].synthetic = false;
      expect(analyse(question, ...inputs)).toMatchObject({
        status: "ineligible_measurement",
        estimate: null,
      });
    }
  });
  it("rejects geography, category, and taxonomy mismatches", () => {
    for (const key of [
      "geographyVersion",
      "category",
      "taxonomyVersion",
    ] as const) {
      const { question, inputs } = fixture();
      inputs[1][key] = "other";
      expect(analyse(question, ...inputs).status).toBe(
        "ineligible_measurement",
      );
    }
    expect(
      seriesSchema.safeParse({ ...fixture().inputs[0], unit: "borough_total" })
        .success,
    ).toBe(false);
  });
  it("retains missing data and never interpolates unavailable counts", () => {
    const { question, inputs } = fixture();
    inputs[0].values[0] = {
      ...inputs[0].values[0],
      complete: false,
      count: null,
    };
    const result = analyse(question, ...inputs);
    expect(result.missingness).toEqual({
      expected: 36,
      predictor: 1,
      outcome: 0,
      paired: 1,
    });
    expect(result.nCommonPeriods).toBe(35);
  });
  it("rejects fake zeros, duplicates and constant or sparse series", () => {
    const { question, inputs } = fixture();
    expect(
      seriesSchema.safeParse({
        ...inputs[0],
        values: [{ month: "2024-01", count: 0, complete: false }],
      }).success,
    ).toBe(false);
    expect(
      seriesSchema.safeParse({
        ...inputs[0],
        values: [inputs[0].values[0], inputs[0].values[0]],
      }).success,
    ).toBe(false);
    inputs[0].values.forEach((v) => (v.count = 4));
    expect(analyse(question, ...inputs).diagnostics).toContain(
      "constant_or_low_variability",
    );
    inputs[0].values.forEach((v, i) => (v.count = i < 33 ? 0 : i));
    expect(analyse(question, ...inputs).diagnostics).toContain("sparse_counts");
  });
  it("calculates tie-aware ranks and a fixed reversed-order negative control", () => {
    const { question, inputs } = fixture();
    inputs[0].values.forEach((v, i) => (v.count = Math.floor(i / 3)));
    inputs[1].values.forEach((v, i) => (v.count = Math.floor(i / 3)));
    expect(analyse(question, ...inputs).estimate).toBeCloseTo(1, 12);
    inputs[1].values.forEach((v, i) => (v.count = 11 - Math.floor(i / 3)));
    expect(analyse(question, ...inputs).estimate).toBeCloseTo(-1, 12);
  });
  it("refuses inference and never emits intervals or p-values", () => {
    const { question, inputs } = fixture();
    expect(
      questionSchema.safeParse({ ...question, inferencePlan: "naive_p_value" })
        .success,
    ).toBe(false);
    expect(analyse(question, ...inputs)).toMatchObject({
      interval: null,
      pValue: null,
      synthetic: true,
      reviewStatus: "unreviewed",
    });
  });
  it("requires current review revisions and prevents empirical publication", () => {
    const state = createDemoState();
    const { question, inputs } = fixture();
    state.analytics = {
      revision: 1,
      runs: [
        {
          id: "run",
          question,
          inputs,
          result: analyse(question, ...inputs),
          reviewNote: null,
        },
      ],
    };
    expect(() =>
      reviewAnalysis(state, "run", 2, "approved_demo", "Reviewed fixture"),
    ).toThrow(/changed/);
    reviewAnalysis(state, "run", 1, "approved_demo", "Reviewed fixture");
    expect(state.analytics.runs[0].result.reviewStatus).toBe("approved_demo");
    state.analytics.runs[0].result.synthetic = false;
    expect(() =>
      reviewAnalysis(state, "run", 2, "approved_demo", "Reviewed fixture"),
    ).toThrow(/fictional/);
  });
});
