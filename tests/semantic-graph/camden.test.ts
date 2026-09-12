import { describe, expect, it } from "vitest";
import {
  projectSemanticGraph,
  semanticGraphSchema,
} from "../../packages/semantic-graph/index.js";
import { toGraphifyGraph } from "../../packages/semantic-graph/graphify.js";
import { createDemoState } from "../../packages/domain/index.js";
import { buildCaseGraph } from "../../packages/camden-evidence/index.js";
import {
  defaultCamdenStudy,
  readCamdenStudy,
  updateCamdenStudy,
  camdenStudySchema,
} from "../../packages/camden-evidence/session.js";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage.js";

const datasets = getDatasetCoverage("camden_town");
const project = (state: ReturnType<typeof createDemoState> | null) =>
  projectSemanticGraph(state, "camden_town", datasets);
describe("Camden source and fictional study projection", () => {
  it("includes five real police records and all supplied source coverage in public mode", () => {
    const graph = project(null);
    expect(
      graph.nodes.filter((node) => node.type === "PoliceRecord"),
    ).toHaveLength(5);
    expect(
      graph.nodes.filter((node) => node.type === "DatasetCoverage"),
    ).toHaveLength(datasets.length);
    expect(graph.nodes.every((node) => !node.synthetic)).toBe(true);
    expect(
      graph.nodes.find(
        (node) => node.id === "coverage:camden_town:community-observations",
      )?.metadata.status,
    ).toBe("not_collected");
    expect(
      graph.nodes.find(
        (node) => node.id === "coverage:camden_town:naptan-stops",
      )?.provenance?.sourceFamilyId,
    ).toBe("dft-naptan");
    expect(
      graph.nodes.find(
        (node) => node.id === "coverage:camden_town:police-priorities",
      )?.provenance?.sourceFamilyId,
    ).toBe("police-uk");
    expect(
      graph.assertions.some(
        (edge) =>
          edge.subjectId === "research-area:camden-circle" &&
          edge.objectId === "area:camden_town",
      ),
    ).toBe(true);
  });
  it("preserves all original real assertion qualification and snapshot hashes", () => {
    const graph = project(null);
    const source = buildCaseGraph("CAM-01", "withdrawn");
    for (const original of source.assertions) {
      const actual = graph.assertions.find((edge) => edge.id === original.id)!;
      const { metadata, ...base } = actual;
      expect({ ...base, ...metadata }).toEqual(original);
    }
    for (const original of source.nodes.filter((node) => node.provenance)) {
      const actual = graph.nodes.find((node) => node.id === original.id)!;
      expect(actual.provenance?.snapshotSha256).toBe(
        original.provenance?.snapshotSha256,
      );
      expect(actual.provenance?.fetchedAt).toBe(original.provenance?.fetchedAt);
    }
  });
  it("changes one fictional example while preserving genuine evidence and other examples", () => {
    const state = createDemoState();
    const before = project(state);
    const unchangedSources = before.nodes.filter((node) => !node.synthetic);
    updateCamdenStudy(state, "CAM-01", {
      expectedRevision: 1,
      state: "corrected",
    });
    const corrected = project(state);
    expect(
      corrected.nodes.find((node) => node.id === "fictional:CAM-01")?.metadata
        .revision,
    ).toBe(2);
    expect(
      corrected.nodes.find((node) => node.id === "fictional:CAM-02")?.metadata
        .revision,
    ).toBe(1);
    expect(corrected.nodes.filter((node) => !node.synthetic)).toEqual(
      unchangedSources,
    );
    updateCamdenStudy(state, "CAM-01", {
      expectedRevision: 2,
      state: "withdrawn",
    });
    const withdrawn = project(state);
    expect(
      withdrawn.nodes.some((node) => node.id.startsWith("fictional:CAM-01")),
    ).toBe(false);
    expect(
      withdrawn.assertions.some(
        (edge) =>
          edge.subjectId.startsWith("fictional:CAM-01") ||
          edge.objectId.startsWith("fictional:CAM-01"),
      ),
    ).toBe(false);
    expect(withdrawn.nodes.filter((node) => !node.synthetic)).toEqual(
      unchangedSources,
    );
  });
  it("rejects stale or malformed study changes without modifying saved state", () => {
    const state = { camdenStudy: defaultCamdenStudy() };
    updateCamdenStudy(state, "CAM-02", {
      expectedRevision: 1,
      state: "withdrawn",
    });
    const saved = structuredClone(state);
    expect(() =>
      updateCamdenStudy(state, "CAM-02", {
        expectedRevision: 1,
        state: "original",
      }),
    ).toThrow("This study changed");
    expect(state).toEqual(saved);
    expect(
      camdenStudySchema.safeParse({ revision: 1, examples: {} }).success,
    ).toBe(false);
    expect(() => readCamdenStudy({ camdenStudy: { revision: 1 } })).toThrow();
  });
  it("rejects real edges supported by fictional evidence and invalid case pairs", () => {
    const graph = project(createDemoState());
    const edge = graph.assertions.find(
      (edge) => edge.methodVersion === "camden-case-study/1" && !edge.synthetic,
    )!;
    expect(
      semanticGraphSchema.safeParse({
        ...graph,
        assertions: [{ ...edge, evidenceRefs: ["fictional:CAM-01"] }],
      }).success,
    ).toBe(false);
    expect(
      semanticGraphSchema.safeParse({
        ...graph,
        assertions: [{ ...edge, objectId: "fictional:CAM-01" }],
      }).success,
    ).toBe(false);
    expect(
      semanticGraphSchema.safeParse({
        ...graph,
        assertions: [{ ...edge, predicate: "CONFIRMS_CRIME" }],
      }).success,
    ).toBe(false);
    expect(
      semanticGraphSchema.safeParse({
        ...graph,
        assertions: [{ ...edge, metadata: undefined }],
      }).success,
    ).toBe(false);
  });
  it("never includes raw report descriptions or owners in either export", () => {
    const state = createDemoState();
    state.reports[0].description = "PRIVATE_SENTINEL_777";
    const graph = project(state);
    const exported = JSON.stringify(toGraphifyGraph(graph));
    expect(exported).not.toContain("PRIVATE_SENTINEL_777");
    expect(exported).not.toContain('"owner"');
    expect(exported).not.toContain('"confidence"');
    expect(graph.nodes.length).toBeLessThanOrEqual(100);
    expect(graph.assertions.length).toBeLessThanOrEqual(200);
  });
  it("preserves parallel assertions as separate directed entities", () => {
    const graph = project(null);
    const first = graph.assertions[0];
    graph.assertions.push({
      ...first,
      id: first.id + ":second",
      reasonCodes: ["separate_qualified_assertion"],
    });
    const exported = toGraphifyGraph(graph);
    expect(exported.nodes).toHaveLength(
      graph.nodes.length + graph.assertions.length,
    );
    expect(exported.edges).toHaveLength(graph.assertions.length * 2);
    const assertion = exported.nodes.find(
      (node) => node.id === `assertion:${first.id}:second`,
    )!;
    expect(assertion.metadata).toEqual(graph.assertions.at(-1));
    expect(new Set(exported.nodes.map((node) => node.id)).size).toBe(
      exported.nodes.length,
    );
  });
});
