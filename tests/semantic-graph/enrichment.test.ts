import { describe, expect, it } from "vitest";
import {
  projectSemanticGraph,
  semanticGraphSchema,
} from "../../packages/semantic-graph/index.js";
import { toGraphifyGraph } from "../../packages/semantic-graph/graphify.js";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage.js";
import mps from "../../research/enrichment/mps-context.json";

const graph = () =>
  projectSemanticGraph(null, "camden_town", getDatasetCoverage("camden_town"));
describe("dated public enrichment graph", () => {
  it("projects seven latest acquired borough cells without creating pilot counts", () => {
    const result = graph();
    const aggregates = result.nodes.filter((node) =>
      node.id.startsWith("aggregate:mps:"),
    );
    const latest = mps.cells
      .map((cell) => cell.month)
      .sort()
      .at(-1);
    const expected = mps.cells.filter(
      (cell) => cell.borough === "Camden" && cell.month === latest,
    );
    expect(aggregates).toHaveLength(7);
    for (const node of aggregates) {
      const source = expected.find(
        (cell) => node.id === `aggregate:mps:${cell.id}`,
      )!;
      expect(node.metadata.value).toBe(source.count);
      expect(node.metadata.period).toBe(latest);
      expect(node.metadata.precision).toBe("borough_and_month_not_pilot_total");
      expect(node.metadata.alertEligible).toBe(false);
      expect(node.provenance?.snapshotSha256).toBe(source.sourceSnapshotSha256);
    }
    expect(result.truncated).toBe(false);
  });
  it("keeps census populations at statistical-area precision without a denominator", () => {
    const population = graph().nodes.filter((node) =>
      node.id.startsWith("aggregate:ons:"),
    );
    expect(population).toHaveLength(2);
    for (const node of population) {
      expect(node.metadata.sourceRecordKey).toMatch(/^E0/);
      expect(node.metadata.boundaryEvidence?.[0].snapshotSha256).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(node.metadata.precision).toBe(
        "whole_statistical_area_anchor_containment_only",
      );
      expect(node.metadata.alertEligible).toBe(false);
    }
  });
  it("joins outcome records to exact police IDs with source lineage and month precision", () => {
    const result = graph();
    const outcomes = result.nodes.filter(
      (node) => node.type === "PoliceOutcome",
    );
    expect(outcomes.length).toBeGreaterThan(4);
    for (const node of outcomes) {
      const edge = result.assertions.find(
        (edge) =>
          edge.subjectId === node.id && edge.predicate === "OUTCOME_FOR",
      )!;
      expect(edge.objectId).toBe(`police:${node.metadata.sourceRecordKey}`);
      expect(edge.reasonCodes).toContain(
        "exact_persistent_id_category_and_month",
      );
      expect(
        result.nodes.find((target) => target.id === edge.objectId)?.type,
      ).toBe("PoliceRecord");
      expect(node.metadata.precision).toBe("month");
    }
    expect(toGraphifyGraph(result).metadata.ontologyVersion).toBe("1.0");
  });
  it.each(["value", "lineage", "join", "method", "qualification"])(
    "rejects tampered %s in exports",
    (field) => {
      const result = graph();
      if (field === "qualification")
        result.assertions.find(
          (edge) => edge.predicate === "OUTCOME_FOR",
        )!.sourceQualification!.recordedAt = "2026-01-01T00:00:00.000Z";
      if (field === "value")
        result.nodes.find(
          (node) => node.type === "HistoricalAggregate",
        )!.metadata.value = 123456789;
      if (field === "lineage")
        result.nodes.find(
          (node) => node.type === "EnrichmentSnapshot",
        )!.provenance!.snapshotSha256 = "a".repeat(64);
      if (field === "join")
        result.assertions.find(
          (edge) => edge.predicate === "OUTCOME_FOR",
        )!.objectId = "area:camden_town";
      if (field === "method")
        result.assertions.find(
          (edge) => edge.predicate === "OUTCOME_FOR",
        )!.methodVersion = "1.0";
      expect(semanticGraphSchema.safeParse(result).success).toBe(false);
    },
  );
  it("keeps outcomes out of other pilots and all enrichment out of scoped notice traversals", () => {
    for (const pilot of ["hounslow_town_centre", "west_croydon"] as const) {
      const result = projectSemanticGraph(
        null,
        pilot,
        getDatasetCoverage(pilot),
      );
      expect(result.nodes.some((node) => node.type === "PoliceOutcome")).toBe(
        false,
      );
      expect(
        result.nodes.filter((node) => node.id.startsWith("aggregate:mps:")),
      ).toHaveLength(7);
      expect(result.truncated).toBe(false);
    }
    const result = projectSemanticGraph(
      null,
      "camden_town",
      [],
      "00000000-0000-4000-8000-000000000000",
    );
    expect(
      result.nodes.some((node) => node.type === "HistoricalAggregate"),
    ).toBe(false);
  });
  it("separates directory schedules from confirmed availability and rejects altered status", () => {
    const result = graph();
    const assertions = result.nodes.filter(
      (node) => node.type === "AvailabilityAssertion",
    );
    expect(assertions).toHaveLength(7);
    for (const node of assertions) {
      expect(["unknown", "unconfirmed"]).toContain(node.metadata.availability);
      expect(node.metadata.alertEligible).toBe(false);
      expect(
        result.assertions.some(
          (edge) =>
            edge.subjectId === node.id && edge.predicate === "AVAILABILITY_FOR",
        ),
      ).toBe(true);
    }
    const help = assertions.find((node) =>
      node.id.startsWith("availability:help:"),
    )!;
    help.metadata.availability = "unknown";
    expect(semanticGraphSchema.safeParse(result).success).toBe(false);
  });
});
