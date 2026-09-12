import { describe, expect, it } from "vitest";
import {
  buildCaseGraph,
  caseGraphSchema,
  fictionalScenarios,
  policeSelection,
  policeSelectionSchema,
  scenarioSchema,
} from "../../packages/camden-evidence";

describe("Camden evidence boundaries", () => {
  it("preserves distinct records at the same anonymised point", () => {
    const second = policeSelection.records[1],
      third = policeSelection.records[2];
    expect(second.raw.location).toEqual(third.raw.location);
    expect(second.raw.persistent_id).not.toBe(third.raw.persistent_id);
    expect(
      buildCaseGraph(second.exampleId).nodes.find(
        (node) => node.type === "PoliceRecord",
      )?.id,
    ).not.toBe(
      buildCaseGraph(third.exampleId).nodes.find(
        (node) => node.type === "PoliceRecord",
      )?.id,
    );
  });
  it("rejects fabricated source classification and absent provenance", () => {
    const source = structuredClone(policeSelection);
    (
      source.records[0].raw as unknown as Record<string, unknown>
    ).offenceSubtype = "sexual_assault";
    expect(policeSelectionSchema.safeParse(source).success).toBe(false);
    expect(
      policeSelectionSchema.safeParse({
        ...policeSelection,
        sourceSnapshotSha256: "",
      }).success,
    ).toBe(false);
  });
  it("does not permit a fictional example to become a real incident match", () => {
    expect(fictionalScenarios).toHaveLength(5);
    for (const scenario of fictionalScenarios) {
      expect(
        scenarioSchema.safeParse({ ...scenario, synthetic: false }).success,
      ).toBe(false);
      expect(
        scenarioSchema.safeParse({ ...scenario, matchesPoliceRecord: true })
          .success,
      ).toBe(false);
      expect(Date.parse(scenario.observedAt)).toBeLessThan(
        Date.parse(scenario.reportedAt),
      );
    }
  });
  it("rejects a direct fictional to police link and wrong source class", () => {
    const graph = buildCaseGraph("CAM-01");
    const policeId = graph.nodes.find(
      (node) => node.type === "PoliceRecord",
    )!.id;
    graph.assertions.find((edge) => edge.synthetic)!.objectId = policeId;
    expect(caseGraphSchema.safeParse(graph).success).toBe(false);
    const changed = buildCaseGraph("CAM-01");
    changed.nodes[0].synthetic = true;
    expect(caseGraphSchema.safeParse(changed).success).toBe(false);
  });
  it("removes withdrawn synthetic projections and keeps real source records intact", () => {
    const before = buildCaseGraph("CAM-01"),
      corrected = buildCaseGraph("CAM-01", "corrected"),
      withdrawn = buildCaseGraph("CAM-01", "withdrawn");
    expect(
      corrected.nodes
        .filter((node) => node.synthetic)
        .every((node) => node.revision === 2),
    ).toBe(true);
    const originalObservation = before.nodes.find(
      (node) => node.type === "FictionalObservation",
    )!;
    const changedObservation = corrected.nodes.find(
      (node) => node.type === "FictionalObservation",
    )!;
    expect(changedObservation.observedAt).not.toBe(
      originalObservation.observedAt,
    );
    expect(changedObservation.reportedAt).toBe(originalObservation.reportedAt);
    expect(changedObservation.correctionNote).toBeTruthy();
    expect(
      corrected.assertions
        .filter((edge) => edge.synthetic)
        .every((edge) => edge.validFrom === changedObservation.observedAt),
    ).toBe(true);
    expect(JSON.stringify(corrected)).not.toContain(
      originalObservation.observedAt,
    );
    expect(
      corrected.nodes.find((node) => node.type === "FictionalSummary")?.label,
    ).toBe(
      before.nodes.find((node) => node.type === "FictionalSummary")?.label,
    );
    expect(withdrawn.nodes.some((node) => node.synthetic)).toBe(false);
    expect(withdrawn.assertions.some((edge) => edge.synthetic)).toBe(false);
    expect(withdrawn.nodes).toEqual(
      before.nodes.filter((node) => !node.synthetic),
    );
    expect(JSON.stringify(withdrawn)).not.toContain(originalObservation.id);
    expect(withdrawn.assertions).toEqual(
      before.assertions.filter((edge) => !edge.synthetic),
    );
    expect(withdrawn.nodes).toEqual(
      corrected.nodes.filter((node) => !node.synthetic),
    );
  });
  it("rejects dangling references, excessive nodes and duplicate identities", () => {
    const graph = buildCaseGraph("CAM-01");
    graph.assertions[0].evidenceRefs = ["missing"];
    expect(caseGraphSchema.safeParse(graph).success).toBe(false);
    const excess = buildCaseGraph("CAM-01");
    excess.nodes.push({ ...excess.nodes[0] });
    expect(caseGraphSchema.safeParse(excess).success).toBe(false);
  });
  it("rejects fictional evidence appended to a real assertion", () => {
    const graph = buildCaseGraph("CAM-01");
    graph.assertions
      .find((edge) => !edge.synthetic)!
      .evidenceRefs.push(
        graph.nodes.find((node) => node.type === "FictionalObservation")!.id,
      );
    expect(caseGraphSchema.safeParse(graph).success).toBe(false);
    const unrelated = buildCaseGraph("CAM-01");
    unrelated.assertions[0].evidenceRefs = [
      unrelated.nodes.find((node) => node.type === "AreaContext")!.id,
    ];
    expect(caseGraphSchema.safeParse(unrelated).success).toBe(false);
  });
  it("requires provenance on every real source type and excludes it from fictional nodes", () => {
    const original = buildCaseGraph("CAM-01");
    for (const node of original.nodes.filter((item) => item.provenance)) {
      const graph = structuredClone(original);
      delete graph.nodes.find((item) => item.id === node.id)!.provenance;
      expect(caseGraphSchema.safeParse(graph).success, node.type).toBe(false);
    }
    const stripped = structuredClone(original);
    for (const node of stripped.nodes) delete node.provenance;
    expect(caseGraphSchema.safeParse(stripped).success).toBe(false);
    const fictional = structuredClone(original);
    fictional.nodes.find((node) => node.synthetic)!.provenance =
      original.nodes[0].provenance;
    expect(caseGraphSchema.safeParse(fictional).success).toBe(false);
    const wrongFamily = structuredClone(original);
    wrongFamily.nodes[0].provenance!.sourceFamilyId =
      "streetwise-fictional-exercise";
    expect(caseGraphSchema.safeParse(wrongFamily).success).toBe(false);
  });
  it("rejects stale revisions and times in corrected graph data", () => {
    const original = buildCaseGraph("CAM-01");
    const originalEdge = original.assertions.find((edge) => edge.synthetic)!;
    for (const field of ["revision", "validFrom"] as const) {
      const graph = buildCaseGraph("CAM-01", "corrected");
      const edge = graph.assertions.find((item) => item.synthetic)!;
      if (field === "revision") edge.revision = originalEdge.revision;
      else edge.validFrom = originalEdge.validFrom;
      expect(caseGraphSchema.safeParse(graph).success, field).toBe(false);
    }
    const staleNode = buildCaseGraph("CAM-01", "corrected");
    staleNode.nodes.find(
      (node) => node.type === "FictionalObservation",
    )!.observedAt = original.nodes.find(
      (node) => node.type === "FictionalObservation",
    )!.observedAt;
    expect(caseGraphSchema.safeParse(staleNode).success).toBe(false);
    const falseState = buildCaseGraph("CAM-01");
    falseState.state = "corrected";
    expect(caseGraphSchema.safeParse(falseState).success).toBe(false);
  });
});
