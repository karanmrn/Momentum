import { describe, expect, it } from "vitest";
import {
  buildExplorerNetwork,
  compareGraphRecords,
} from "../src/graph-explorer-model";
import { projectSemanticGraph } from "../packages/semantic-graph";
import type { SemanticGraph } from "../packages/semantic-graph/schema";
import { getDatasetCoverage } from "../packages/datasets/src/coverage";
import { createDemoState } from "../packages/domain";

const project = (demo = false) =>
  projectSemanticGraph(
    demo ? createDemoState() : null,
    "camden_town",
    getDatasetCoverage("camden_town"),
  );
const node = (id: string): SemanticGraph["nodes"][number] => ({
  id,
  label: id,
  type: "Place",
  synthetic: false,
  provenance: null,
  metadata: {},
});
const edge = (
  from: string,
  to: string,
  id = `${from}-${to}`,
): SemanticGraph["assertions"][number] => ({
  id,
  subjectId: from,
  objectId: to,
  predicate: "CONTEXTUAL_AREA_ONLY",
  inferenceType: "deterministic_join",
  evidenceRefs: [from],
  reasonCodes: ["area_context"],
  methodVersion: "1.0",
  synthetic: false,
});
const graph = (
  ids: string[],
  assertions: SemanticGraph["assertions"],
): SemanticGraph => ({
  ontologyVersion: "1.0",
  pilotId: "camden_town",
  nodes: ids.map(node),
  assertions,
  limitations: [],
  truncated: false,
});

describe("graph explorer projection", () => {
  it("retains every source node, assertion, hash, interval, and source month", () => {
    const source = project(true);
    const network = buildExplorerNetwork(source);
    expect(network.nodes.map((item) => item.id)).toEqual(
      source.nodes.map((item) => item.id),
    );
    expect(network.edges.map((item) => item.id)).toEqual(
      source.assertions.map((item) => item.id),
    );
    for (const item of source.nodes) {
      const actual = network.nodes.find(
        (candidate) => candidate.id === item.id,
      )!;
      expect(actual.synthetic).toBe(item.synthetic);
      expect(actual.sourceUrl).toBe(item.provenance?.sourceUrl);
      const details = new Map(actual.details);
      if (item.provenance?.snapshotSha256)
        expect(details.get("Snapshot SHA256")).toBe(
          item.provenance.snapshotSha256,
        );
      if (item.metadata.months?.length)
        expect(details.get("Source months")).toBe(
          item.metadata.months.join(", "),
        );
      if (item.metadata.precision)
        expect(details.get("Precision")).toBe(
          item.metadata.precision.replaceAll("_", " "),
        );
    }
    for (const item of source.assertions.filter((item) => item.metadata)) {
      const actual = new Map(
        network.edges.find((candidate) => candidate.id === item.id)!.details,
      );
      expect(actual.get("Valid from")).toBe(
        item.metadata!.validFrom ?? "Unknown",
      );
      expect(actual.get("Valid to")).toBe(item.metadata!.validTo ?? "Unknown");
      expect(actual.get("Source independence")).toBe("unknown");
      expect(actual.get("Original claim lineage")).toBe(
        item.metadata!.originGroupId ?? "Unknown",
      );
    }
  });

  it("labels every node and edge in a research graph as local research", () => {
    const source = graph(
      ["research", "area", "source"],
      [edge("research", "area"), edge("research", "source")],
    );
    source.nodes[0].type = "DatasetRecord";
    source.nodes[1].type = "Area";
    source.nodes[2].type = "Source";
    const network = buildExplorerNetwork(source);
    for (const node of network.nodes)
      expect(new Map(node.details).get("Data basis")).toBe(
        "Local research source record",
      );
    for (const edge of network.edges)
      expect(new Map(edge.details).get("Data basis")).toBe(
        "Local research source relationship",
      );
    source.nodes = source.nodes.slice(1);
    source.assertions = [];
    source.limitations = ["Local research only. Publication remains disabled."];
    for (const node of buildExplorerNetwork(source).nodes)
      expect(new Map(node.details).get("Data basis")).toBe(
        "Local research source record",
      );
  });

  it("keeps public projections free of fictional records and private report content", () => {
    const publicNetwork = buildExplorerNetwork(project());
    expect(publicNetwork.nodes.every((item) => !item.synthetic)).toBe(true);
    const state = createDemoState();
    const network = buildExplorerNetwork(
      projectSemanticGraph(
        state,
        "camden_town",
        getDatasetCoverage("camden_town"),
      ),
    );
    for (const report of state.reports) {
      expect(JSON.stringify(network)).not.toContain(report.id);
    }
  });

  it("preserves source basis, observed interval, and explicit unknown provenance", () => {
    const source = graph(["a"], []);
    source.nodes[0].metadata = {
      observedAt: "2026-09-12T10:00:00Z",
      observedTo: "2026-09-12T11:00:00Z",
      sourceKind: "community_other_source",
      timePrecision: "time_window",
    };
    source.nodes[0].provenance = {
      sourceId: "source",
      sourceFamilyId: "family",
      sourceUrl: null,
      fetchedAt: null,
      originGroupId: null,
    };
    const details = new Map(buildExplorerNetwork(source).nodes[0].details);
    expect(details.get("Source basis")).toBe("community other source");
    expect(details.get("Observed time")).toBe("2026-09-12T10:00:00Z");
    expect(details.get("Observation interval end")).toBe(
      "2026-09-12T11:00:00Z",
    );
    expect(details.get("Original claim lineage")).toBe("Unknown");
  });
});

describe("bounded record comparison", () => {
  it("explains shared real police context without a crime relationship or cause", () => {
    const source = project();
    const police = source.nodes.filter((item) => item.type === "PoliceRecord");
    const result = compareGraphRecords(source, police[0].id, police[1].id);
    expect(result.title).toBe("Context connection only");
    expect(result.edgeIds.length).toBeGreaterThan(0);
    expect(result.edgeIds.length).toBeLessThanOrEqual(4);
    expect(result.explanation).toContain(
      "does not establish that separate crimes are related",
    );
    expect(result.causation).toContain("does not establish a cause");
  });

  it("describes a direct source assertion without reversing its meaning", () => {
    const source = project();
    const assertion = source.assertions.find(
      (item) => item.predicate === "DERIVED_FROM",
    )!;
    const direct = compareGraphRecords(
      source,
      assertion.subjectId,
      assertion.objectId,
    );
    expect(direct.title).toBe("Recorded source relationship");
    expect(direct.edgeIds).toEqual([assertion.id]);
    expect(direct.steps[0].label).toBe("Derived from source");
    const reverse = compareGraphRecords(
      source,
      assertion.objectId,
      assertion.subjectId,
    );
    expect(reverse.steps[0].label).toContain("reverse direction");
  });

  it("retains fictional operational review qualifications without implying causation", () => {
    const source = graph(["a", "b"], [edge("a", "b")]);
    source.nodes.forEach((item) => {
      item.type = "PublishedNotice";
      item.synthetic = true;
    });
    Object.assign(source.assertions[0], {
      predicate: "SAME_OPERATIONAL_ISSUE_AS",
      synthetic: true,
      inferenceType: "human_review",
      methodVersion: "fictional-relations/1",
      evidenceRefs: ["a", "b"],
      qualification: {
        reviewedAt: "2026-09-12T12:00:00Z",
        validFrom: "2026-09-12T10:00:00Z",
        validTo: "2026-09-12T11:00:00Z",
        sourceFamilyIds: [
          "streetwise-fictional-relations",
          "streetwise-demo-community",
        ],
        independence: "unknown",
      },
    });
    const result = compareGraphRecords(source, "a", "b");
    expect(result.title).toBe("Reviewed operational relationship");
    expect(result.explanation).toContain("Source independence remains unknown");
    expect(result.explanation).toContain("fictional demonstration data");
    expect(result.explanation).toContain("2026-09-12T12:00:00Z");
    expect(result.causation).toContain("does not establish a cause");
  });

  it("does not infer a transitive operational relationship", () => {
    const source = graph(["a", "b", "c"], [edge("a", "b"), edge("b", "c")]);
    source.assertions.forEach((item) => {
      item.predicate = "SAME_OPERATIONAL_ISSUE_AS";
      item.synthetic = true;
    });
    expect(compareGraphRecords(source, "a", "c").title).toBe(
      "Context connection only",
    );
  });

  it("reports disconnected, absent, and same records without leaking unknown IDs", () => {
    const source = graph(["a", "b"], []);
    expect(compareGraphRecords(source, "a", "b").title).toBe(
      "No recorded connection",
    );
    const unknown = compareGraphRecords(source, "a", "private-report-secret");
    expect(unknown.nodeIds).toEqual([]);
    expect(JSON.stringify(unknown)).not.toContain("private-report-secret");
    expect(compareGraphRecords(source, "a", "a").title).toBe(
      "Choose different records",
    );
  });

  it("stops after four relationships and identifies omitted records", () => {
    const source = graph(
      ["a", "b", "c", "d", "e", "f"],
      [
        edge("a", "b"),
        edge("b", "c"),
        edge("c", "d"),
        edge("d", "e"),
        edge("e", "f"),
      ],
    );
    expect(compareGraphRecords(source, "a", "e").edgeIds).toHaveLength(4);
    source.truncated = true;
    expect(compareGraphRecords(source, "a", "f").explanation).toContain(
      "projection omits some records",
    );
  });

  it("ignores dangling endpoints and evidence outside the public projection", () => {
    const source = graph(
      ["a", "b"],
      [
        edge("a", "private"),
        edge("private", "b"),
        { ...edge("a", "b"), evidenceRefs: ["private"] },
      ],
    );
    expect(compareGraphRecords(source, "a", "b").edgeIds).toEqual([]);
  });

  it("rejects oversized comparisons before traversal", () => {
    const source = graph(
      Array.from({ length: 501 }, (_, i) => String(i)),
      [],
    );
    expect(compareGraphRecords(source, "0", "1").title).toBe(
      "Comparison unavailable",
    );
    source.nodes = [node("0"), node("1")];
    source.assertions = Array.from({ length: 1001 }, (_, i) =>
      edge("0", "1", String(i)),
    );
    expect(compareGraphRecords(source, "0", "1").edgeIds).toEqual([]);
  });
});
