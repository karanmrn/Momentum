import { describe, expect, it } from "vitest";
import {
  scenarioPack,
  scenarioPackSchema,
  runScenario,
  createShareReference,
  resolveShareReference,
  type ScenarioPack,
} from "../../packages/community-demo/index.js";
import {
  createDemoState,
  submitReport,
  decideReport,
  withdrawReport,
} from "../../packages/domain/index.js";
import { reportInputSchema } from "../../packages/contracts/index.js";

describe("Original fictional community exercises", () => {
  it.each(
    scenarioPack.scenarios.map((scenario) => [scenario.id, scenario] as const),
  )("runs %s in isolated state", (id, scenario) => {
    const result = runScenario(id);
    expect(result.synthetic).toBe(true);
    expect(result.ownerPrivate).toBe(true);
    expect(result.shareDeniedBeforeReview).toBe(true);
    expect(result.finalReportStatus).toBe("withdrawn");
    expect(result.reportRedacted).toBe(true);
    expect(result.state.reports).toHaveLength(1);
    if (scenario.publication === "private_only") {
      expect(result.shared).toBeNull();
      expect(result.state.notices).toEqual([]);
    } else {
      expect(result.shared?.status).toBe("active");
      expect(result.corrected?.status).toBe("retracted");
      expect(result.corrected?.summary).toBe(scenario.correctionSummary);
      expect(result.corrected?.graph.edges).toEqual([]);
      expect(result.withdrawn?.graph.edges).toEqual([]);
      expect(result.withdrawn?.summary).toBe(
        "A reviewed community summary was withdrawn.",
      );
      expect(result.notificationKinds).toContain("correction");
      const shared = JSON.stringify(result.shared);
      expect(shared).not.toContain(scenario.description);
      expect(shared).not.toContain(result.state.reports[0].id);
      expect(shared).not.toContain("authorId");
    }
    expect(JSON.stringify(result.state)).not.toContain(scenario.description);
  });

  it("rejects malformed packs and unsafe publication settings", () => {
    const changes: Array<(pack: ScenarioPack) => unknown> = [
      (pack) => ({ ...pack, synthetic: false }),
      (pack) => ({ ...pack, origin: "nextdoor" }),
      (pack) => ({
        ...pack,
        authors: [
          { ...pack.authors[0], email: "test@example.com" },
          ...pack.authors.slice(1),
        ],
      }),
      (pack) => {
        pack.authors[0].displayName = "Unlabelled person";
        return pack;
      },
      (pack) => {
        pack.scenarios[1].topic = pack.scenarios[0].topic;
        return pack;
      },
      (pack) => {
        pack.authors[1].id = pack.authors[0].id;
        return pack;
      },
      (pack) => {
        pack.scenarios[1].id = pack.scenarios[0].id;
        return pack;
      },
      (pack) => {
        pack.scenarios[0].authorId = "missing-author";
        return pack;
      },
      (pack) => ({
        ...pack,
        scenarios: [
          { ...pack.scenarios[0], pilotId: "outside-pilot" },
          ...pack.scenarios.slice(1),
        ],
      }),
      (pack) => {
        pack.scenarios[0].description = "x".repeat(601);
        return pack;
      },
      (pack) => {
        pack.scenarios.find(
          (scenario) => scenario.topic === "sexual_violence",
        )!.publication = "reviewable";
        return pack;
      },
      (pack) => {
        pack.scenarios.pop();
        return pack;
      },
    ];
    for (const change of changes) {
      const malformed = change(structuredClone(scenarioPack));
      expect(scenarioPackSchema.safeParse(malformed).success).toBe(false);
    }
    const mismatch = structuredClone(scenarioPack);
    mismatch.scenarios[0].authorId = mismatch.authors.find(
      (author) => author.pilotId !== mismatch.scenarios[0].pilotId,
    )!.id;
    expect(scenarioPackSchema.safeParse(mismatch).success).toBe(false);
  });

  it("refuses stale revisions and another member withdrawal", () => {
    const state = createDemoState();
    const scenario = scenarioPack.scenarios.find(
      (item) => item.publication === "reviewable",
    )!;
    const report = submitReport(
      state,
      "alex",
      reportInputSchema.parse({
        pilotId: scenario.pilotId,
        category: "community",
        title: scenario.title,
        description: scenario.description,
        place: scenario.place,
        observedAt: scenario.observedAt,
        synthetic: true,
      }),
    );
    expect(() =>
      withdrawReport(state, "sam", report.id, report.revision),
    ).toThrow(expect.objectContaining({ status: 404 }));
    const approved = decideReport(state, "moderator", report.id, {
      expectedRevision: 1,
      action: "approve",
      summary: scenario.approvedSummary,
    });
    const reference = createShareReference(state, report.id);
    expect(Object.keys(reference).sort()).toEqual(["noticeId", "synthetic"]);
    expect(() =>
      decideReport(state, "moderator", report.id, {
        expectedRevision: 1,
        action: "retract",
        summary: scenario.correctionSummary,
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
    withdrawReport(state, "alex", report.id, approved.revision);
    expect(resolveShareReference(state, reference).status).toBe("retracted");
    expect(() => createShareReference(state, report.id)).toThrow();
    expect(() =>
      resolveShareReference(state, { ...reference, synthetic: false } as never),
    ).toThrow();
  });

  it("refuses unknown scenarios and does not reuse mutable state", () => {
    expect(() => runScenario("unknown-scenario")).toThrow(
      "Unknown fictional scenario.",
    );
    const first = runScenario(scenarioPack.scenarios[0].id);
    const second = runScenario(scenarioPack.scenarios[0].id);
    expect(first.state.reports[0].id).not.toBe(second.state.reports[0].id);
  });
});
