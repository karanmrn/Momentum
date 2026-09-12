import { describe, expect, it } from "vitest";
import {
  projectSemanticGraph,
  semanticGraphSchema,
  type SemanticGraph,
} from "../../packages/semantic-graph/index.js";
import { toGraphifyGraph } from "../../packages/semantic-graph/graphify.js";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage.js";
import { createDemoState } from "../../packages/domain/index.js";
import { updateCamdenStudy } from "../../packages/camden-evidence/session.js";

const projection = () =>
  projectSemanticGraph(
    createDemoState(),
    "camden_town",
    getDatasetCoverage("camden_town"),
  );
const sourceAssertion = (graph: SemanticGraph) =>
  graph.assertions.find(
    (edge) => edge.methodVersion === "camden-case-study/1" && !edge.synthetic,
  )!;
const cases: Array<[string, (graph: SemanticGraph) => void]> = [
  [
    "method downgrade and missing qualification",
    (graph) => {
      const edge = sourceAssertion(graph);
      edge.methodVersion = "1.0";
      delete edge.metadata;
    },
  ],
  [
    "wrong temporal precision",
    (graph) => {
      sourceAssertion(graph).metadata!.timePrecision = "day";
    },
  ],
  [
    "invented originating claim",
    (graph) => {
      sourceAssertion(graph).metadata!.originGroupId =
        "invented-independent-origin";
    },
  ],
  [
    "changed historical interval",
    (graph) => {
      sourceAssertion(graph).metadata!.validFrom = "2026-07-12T12:00:00Z";
    },
  ],
  [
    "wrong spatial precision",
    (graph) => {
      sourceAssertion(graph).metadata!.spatialPrecision = "broad_area_context";
    },
  ],
  [
    "changed snapshot hash",
    (graph) => {
      graph.nodes.find(
        (node) => node.type === "SourceSnapshot",
      )!.provenance!.snapshotSha256 = "a".repeat(64);
    },
  ],
  [
    "rewired historical source relation",
    (graph) => {
      const edge = sourceAssertion(graph);
      edge.subjectId = graph.nodes.filter(
        (node) => node.type === "PoliceRecord",
      )[1].id;
    },
  ],
  [
    "case assertion disguised as generic context",
    (graph) => {
      const edge = sourceAssertion(graph);
      edge.id = "new-generic-assertion";
      edge.methodVersion = "1.0";
      delete edge.metadata;
    },
  ],
  [
    "invented case node",
    (graph) => {
      graph.nodes.find((node) => node.type === "PoliceRecord")!.label =
        "A different alleged incident";
    },
  ],
];
describe("Case qualification cannot be weakened in an exported graph", () => {
  it.each(cases)("rejects %s", (_label, mutate) => {
    const graph = projection();
    mutate(graph);
    expect(semanticGraphSchema.safeParse(graph).success).toBe(false);
    expect(() => toGraphifyGraph(graph)).toThrow();
  });
  it("keeps generic study and help bridges valid", () => {
    const graph = projection();
    const bridges = graph.assertions.filter(
      (edge) =>
        edge.predicate === "CONTEXTUAL_AREA_ONLY" &&
        edge.objectId === "area:camden_town" &&
        !edge.subjectId.startsWith("aggregate:"),
    );
    expect(bridges.length).toBeGreaterThan(1);
    expect(
      bridges.every(
        (edge) => edge.methodVersion === "1.0" && edge.metadata === undefined,
      ),
    ).toBe(true);
    expect(semanticGraphSchema.safeParse(graph).success).toBe(true);
    expect(toGraphifyGraph(graph).edges.length).toBe(
      graph.assertions.length * 2,
    );
  });
  it("rejects an original assertion attached to a corrected fictional observation", () => {
    const state = createDemoState(),
      original = projection();
    updateCamdenStudy(state, "CAM-01", {
      expectedRevision: 1,
      state: "corrected",
    });
    const corrected = projectSemanticGraph(
      state,
      "camden_town",
      getDatasetCoverage("camden_town"),
    );
    const oldEdge = original.assertions.find(
      (edge) => edge.subjectId === "fictional:CAM-01",
    )!;
    const index = corrected.assertions.findIndex(
      (edge) => edge.subjectId === "fictional:CAM-01",
    );
    corrected.assertions[index] = oldEdge;
    expect(semanticGraphSchema.safeParse(corrected).success).toBe(false);
  });
});
