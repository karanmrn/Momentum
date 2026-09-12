import { describe, expect, it } from "vitest";
import {
  createDemoState,
  decideReport,
  submitReport,
  withdrawReport,
} from "../../packages/domain/index.js";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage.js";
import {
  projectSemanticGraph,
  semanticGraphSchema,
} from "../../packages/semantic-graph/index.js";
import type { DatasetCoverageRecord } from "../../packages/contracts/index.js";

const pilot = "hounslow_town_centre";
const coverage: DatasetCoverageRecord = {
  id: "police-street",
  title: "Historical police records",
  pilotId: pilot,
  sourceKind: "historical_police",
  status: "acquired",
  acquiredMonths: ["2026-07"],
  latestMonth: "2026-07",
  fetchedAt: "2026-09-12T12:00:00.000Z",
  sourceUrl: "https://data.police.uk/docs/method/crime-street/",
  geographyDescription: "Unreviewed research circle.",
  limitations: ["Approximate geography cannot confirm a report."],
  recordCount: null,
  acquiredUnits: 1,
  unitLabel: "monthly source files",
};

describe("semantic projection of existing public records", () => {
  it("reads the actual dataset adapter without inventing public incident counts", () => {
    const graph = projectSemanticGraph(null, pilot, getDatasetCoverage(pilot));
    expect(graph.nodes.some((node) => node.type === "DatasetCoverage")).toBe(
      true,
    );
    expect(graph.nodes.every((node) => !node.synthetic)).toBe(true);
    expect(JSON.stringify(graph)).not.toContain("recordCount");
    expect(graph.nodes.some((node) => node.type === "PublishedNotice")).toBe(
      false,
    );
  });

  it("joins only contextual coverage and preserves separate source lineage and synthetic status", () => {
    const state = createDemoState();
    const graph = projectSemanticGraph(state, pilot, [coverage]);
    const context = graph.assertions.filter(
      (edge) => edge.predicate === "CONTEXTUAL_HISTORY_FOR",
    );
    expect(context).toHaveLength(1);
    expect(context[0].reasonCodes).toContain("not_event_confirmation");
    expect(context[0].synthetic).toBe(true);
    const notice = graph.nodes.find((node) => node.type === "PublishedNotice")!;
    expect(notice.provenance?.originGroupId).toBe(
      state.notices[0].evidence[0].originGroupId,
    );
    expect(notice.provenance?.sourceFamilyId).toBe(
      state.notices[0].evidence[0].sourceFamilyId,
    );
    expect(
      graph.nodes.find((node) => node.type === "DatasetCoverage")?.synthetic,
    ).toBe(false);
    expect(graph.nodes.some((node) => node.label.includes("Camden"))).toBe(
      false,
    );
  });

  it("does not expose private submissions through content, counts, IDs or graph paths", () => {
    const state = createDemoState();
    const before = projectSemanticGraph(state, pilot, [coverage]);
    const report = submitReport(state, "alex", {
      pilotId: pilot,
      category: "infrastructure",
      title: "Private fictional lighting detail",
      description: "Private narrative marker reserved for the reviewer.",
      place: "Fictional plaza",
      observedAt: "2026-09-12T11:00:00.000Z",
      synthetic: true,
    });
    const after = projectSemanticGraph(state, pilot, [coverage]);
    expect(after).toEqual(before);
    for (const privateValue of [report.id, report.description, report.title])
      expect(JSON.stringify(after)).not.toContain(privateValue);
  });

  it.each(["withdraw", "retract", "resolve"] as const)(
    "rebuilds after %s and removes dependent links and text",
    (action) => {
      const state = createDemoState();
      const report = state.reports[0];
      const noticeId = report.noticeId!;
      const original = projectSemanticGraph(state, pilot, [coverage], noticeId);
      expect(
        original.assertions.some(
          (edge) => edge.predicate === "CONTEXTUAL_HISTORY_FOR",
        ),
      ).toBe(true);
      if (action === "withdraw")
        withdrawReport(state, "alex", report.id, report.revision);
      else
        decideReport(state, "moderator", report.id, {
          expectedRevision: report.revision,
          action,
          summary: "Reviewed fictional correction applies.",
        });
      const current = projectSemanticGraph(state, pilot, [coverage], noticeId);
      expect(
        current.nodes.some(
          (node) => node.type === "PublishedNotice" || node.type === "Place",
        ),
      ).toBe(false);
      expect(
        current.assertions.some(
          (edge) => edge.predicate === "CONTEXTUAL_HISTORY_FOR",
        ),
      ).toBe(false);
      expect(JSON.stringify(current)).not.toContain(
        original.nodes.find((node) => node.type === "PublishedNotice")!.metadata
          .summary,
      );
    },
  );

  it("keeps missing source coverage unknown and emits no historical context assertion", () => {
    const graph = projectSemanticGraph(createDemoState(), pilot, [
      {
        ...coverage,
        status: "blocked",
        acquiredMonths: [],
        latestMonth: null,
        fetchedAt: null,
        acquiredUnits: null,
      },
    ]);
    expect(
      graph.nodes.find((node) => node.type === "DatasetCoverage")?.metadata
        .status,
    ).toBe("blocked");
    expect(
      graph.assertions.some(
        (edge) => edge.predicate === "CONTEXTUAL_HISTORY_FOR",
      ),
    ).toBe(false);
    expect(graph.limitations.join(" ")).toContain(
      "Missing data does not mean no incidents",
    );
  });

  it("rejects invalid input and prohibited ontology relations", () => {
    expect(() => projectSemanticGraph(null, "london", [])).toThrow();
    expect(() =>
      projectSemanticGraph(null, pilot, [{ ...coverage, recordCount: 10 }]),
    ).toThrow();
    expect(() =>
      projectSemanticGraph(null, pilot, [coverage, coverage]),
    ).toThrow();
    const graph = projectSemanticGraph(createDemoState(), pilot, [coverage]);
    expect(
      semanticGraphSchema.safeParse({
        ...graph,
        assertions: [{ ...graph.assertions[0], predicate: "CONFIRMS_CRIME" }],
      }).success,
    ).toBe(false);
    expect(
      semanticGraphSchema.safeParse({
        ...graph,
        assertions: [{ ...graph.assertions[0], objectId: "private:secret" }],
      }).success,
    ).toBe(false);
  });

  it("bounds the current public projection and keeps references valid when truncated", () => {
    const state = createDemoState();
    const first = state.notices[0];
    state.notices = Array.from({ length: 120 }, (_, index) => ({
      ...first,
      id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    const graph = projectSemanticGraph(state, pilot, [coverage]);
    expect(graph.truncated).toBe(true);
    expect(graph.nodes.length).toBeLessThanOrEqual(100);
    expect(graph.assertions.length).toBeLessThanOrEqual(200);
    expect(semanticGraphSchema.safeParse(graph).success).toBe(true);
  });
});
