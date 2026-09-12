import { describe, expect, it } from "vitest";
import {
  createDemoState,
  decideReport,
  editReport,
  submitReport,
  withdrawReport,
} from "../../packages/domain/index.js";
import {
  defaultRelationReview,
  loadRelationExamples,
  generateCandidates,
  decideCandidate,
  relationReviewView,
  readRelationReview,
  mergeReviewCluster,
  splitReviewCluster,
  undoClusterEvent,
  approvedOperationalRelations,
} from "../../packages/relation-review/index.js";
import type { DemoState, PilotId } from "../../packages/contracts/index.js";
const area: PilotId = "camden_town";
function setup() {
  const state = createDemoState();
  loadRelationExamples(
    state,
    "moderator",
    { area, expectedRevision: 1 },
    "load-examples",
  );
  generateCandidates(
    state,
    "moderator",
    { area, expectedRevision: 2 },
    "generate-first",
  );
  return state;
}
const revision = (state: DemoState) => readRelationReview(state).revision;
const view = (state: DemoState) => relationReviewView(state, "moderator", area);
const active = (state: DemoState) =>
  view(state).candidates.filter(
    (candidate) => candidate.status === "candidate",
  );
const op = (state: DemoState) =>
  active(state).find((candidate) => candidate.independence === "unknown")!;
describe("Fictional relation candidates", () => {
  it("creates bounded explained pairs without counting copied origins as independent", () => {
    const state = setup(),
      candidates = active(state);
    expect(candidates).toHaveLength(3);
    expect(
      candidates.filter((row) => row.independence === "shared_origin"),
    ).toHaveLength(1);
    expect(
      candidates.every((row) =>
        row.reasonCodes.includes("same_fictional_asset_reference"),
      ),
    ).toBe(true);
    expect(
      candidates.every((row) => row.predicate === "POSSIBLE_DUPLICATE_OF"),
    ).toBe(true);
    const copy = candidates.find(
      (row) => row.independence === "shared_origin",
    )!;
    expect(() =>
      decideCandidate(
        state,
        "moderator",
        copy.id,
        {
          area,
          expectedRevision: 3,
          action: "approve",
          reason: "Copied source",
        },
        "approve-copy",
      ),
    ).toThrow("distinct source lineage");
    expect(revision(state)).toBe(3);
    expect(approvedOperationalRelations(state, area)).toEqual([]);
  });
  it("keeps approximate places as candidates and rejects operational promotion", () => {
    const state = createDemoState();
    for (let i = 0; i < 2; i++)
      submitReport(state, "alex", {
        pilotId: area,
        category: "infrastructure",
        title: `Fictional approximate report ${i}`,
        description: "Fictional uncertain location observation.",
        place: "Broad Camden approach",
        observedAt: "2026-09-12T12:00:00Z",
        synthetic: true,
      });
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "generate-approx",
    );
    const candidate = active(state)[0];
    expect(
      candidate.participants.every(
        (p) => p.assetId === null && p.timePrecision === "reported_point",
      ),
    ).toBe(true);
    expect(() =>
      decideCandidate(
        state,
        "moderator",
        candidate.id,
        {
          area,
          expectedRevision: 2,
          action: "approve",
          reason: "Looks nearby",
        },
        "approve-approx",
      ),
    ).toThrow("matching asset intervals");
  });
  it("publishes only reviewed active notice pairs and invalidates changed reports", () => {
    const state = setup();
    const ids = [
      ...new Set(
        active(state).flatMap((candidate) =>
          candidate.participants.map((p) => p.reportId),
        ),
      ),
    ];
    for (const id of ids)
      decideReport(state, "moderator", id, {
        expectedRevision: 1,
        action: "approve",
        summary:
          "Fictional reviewed lamp summary. Actual condition is unknown.",
      });
    expect(
      view(state).candidates.every((row) => row.status === "invalidated"),
    ).toBe(true);
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 3 },
      "generate-published",
    );
    const candidate = op(state);
    decideCandidate(
      state,
      "moderator",
      candidate.id,
      {
        area,
        expectedRevision: 4,
        action: "approve",
        reason: "Same fictional asset and overlapping account intervals.",
      },
      "approve-operational",
    );
    const relations = approvedOperationalRelations(state, area);
    expect(relations).toHaveLength(1);
    for (const id of ids) expect(JSON.stringify(relations)).not.toContain(id);
    expect(JSON.stringify(relations)).not.toContain("owner");
    expect(relations[0].qualification.independence).toBe("unknown");
    const report = state.reports.find(
      (report) => report.id === candidate.participants[0].reportId,
    )!;
    withdrawReport(state, "alex", report.id, report.revision);
    expect(approvedOperationalRelations(state, area)).toEqual([]);
    expect(
      view(state).candidates.find((row) => row.id === candidate.id)?.status,
    ).toBe("invalidated");
  });
  it("invalidates fixture precision after the report text changes", () => {
    const state = setup(),
      candidate = op(state),
      report = state.reports.find(
        (report) => report.id === candidate.participants[0].reportId,
      )!;
    editReport(state, "alex", report.id, {
      action: "edit",
      expectedRevision: 1,
      changes: {
        category: report.category,
        title: report.title,
        description:
          "Changed fictional account. Exact asset is no longer supported.",
        place: report.place,
        observedAt: report.observedAt,
        synthetic: true,
      },
    });
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 3 },
      "regenerate-edit",
    );
    const related = active(state).filter((row) =>
      row.participants.some((p) => p.reportId === report.id),
    );
    expect(related.length).toBeGreaterThan(0);
    expect(
      related.every(
        (row) =>
          row.participants.find((p) => p.reportId === report.id)?.assetId ===
          null,
      ),
    ).toBe(true);
    expect(() =>
      decideCandidate(
        state,
        "moderator",
        related[0].id,
        {
          area,
          expectedRevision: 4,
          action: "approve",
          reason: "Changed source",
        },
        "edited-promotion",
      ),
    ).toThrow();
  });
  it("denies private reads, wrong areas, stale revisions, and request spoofing", () => {
    const state = setup(),
      candidate = op(state);
    expect(() => relationReviewView(state, "alex", area)).toThrow("moderator");
    expect(() =>
      decideCandidate(
        state,
        "moderator",
        candidate.id,
        {
          area: "west_croydon",
          expectedRevision: 3,
          action: "reject",
          reason: "Wrong area",
        },
        "wrong-area",
      ),
    ).toThrow("unavailable");
    expect(() =>
      generateCandidates(
        state,
        "moderator",
        { area, expectedRevision: 2 },
        "stale-command",
      ),
    ).toThrow("changed");
    expect(() =>
      generateCandidates(
        state,
        "moderator",
        {
          area,
          expectedRevision: 3,
          sourceKind: "police",
          predicate: "CONFIRMS_CRIME",
        },
        "spoof-input",
      ),
    ).toThrow();
    expect(revision(state)).toBe(3);
  });
  it("replays commands without duplicate examples, decisions, or groups", () => {
    const state = setup(),
      before = structuredClone(state);
    loadRelationExamples(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "load-examples",
    );
    expect(state).toEqual(before);
    expect(() =>
      loadRelationExamples(
        state,
        "moderator",
        { area: "west_croydon", expectedRevision: 1 },
        "load-examples",
      ),
    ).toThrow("different action");
    const candidate = op(state),
      input = {
        area,
        expectedRevision: 3,
        action: "reject",
        reason: "Fictional review rejected.",
      };
    decideCandidate(state, "moderator", candidate.id, input, "reject-replay");
    decideCandidate(state, "moderator", candidate.id, input, "reject-replay");
    expect(revision(state)).toBe(4);
  });
  it("bounds candidate generation before pair expansion", () => {
    const state = createDemoState();
    for (let i = 0; i < 80; i++)
      submitReport(state, "alex", {
        pilotId: area,
        category: "community",
        title: `Fictional bounded report ${i}`,
        description: "Fictional test account only.",
        place: "Shared approximate area",
        observedAt: "2026-09-12T12:00:00Z",
        synthetic: true,
      });
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "bounded-generate",
    );
    expect(active(state)).toHaveLength(40);
    expect(
      new Set(
        active(state).flatMap((candidate) =>
          candidate.participants.map((p) => p.reportId),
        ),
      ).size,
    ).toBeLessThanOrEqual(40);
    expect(approvedOperationalRelations(state, area)).toEqual([]);
  });
});
describe("Reversible private review grouping", () => {
  it("splits and undoes a merge without adding pairwise assertions", () => {
    const state = setup(),
      ids = [
        ...new Set(
          active(state).flatMap((row) =>
            row.participants.map((p) => p.reportId),
          ),
        ),
      ];
    mergeReviewCluster(
      state,
      "moderator",
      {
        area,
        expectedRevision: 3,
        reportIds: ids,
        reason: "Review these accounts together.",
      },
      "merge-group",
    );
    const group = view(state).clusters[0],
      candidateCount = view(state).candidates.length;
    splitReviewCluster(
      state,
      "moderator",
      group.id,
      {
        area,
        expectedRevision: 4,
        partitions: [ids.slice(0, 2), ids.slice(2)],
        reason: "Separate the selected account.",
      },
      "split-group",
    );
    const split = view(state).events.at(-1)!;
    expect(view(state).clusters[0].reportIds).toHaveLength(2);
    undoClusterEvent(
      state,
      "moderator",
      split.id,
      {
        area,
        expectedRevision: 5,
        reason: "Restore the earlier review grouping.",
      },
      "undo-split",
    );
    expect(view(state).clusters).toEqual([group]);
    expect(view(state).events.map((event) => event.action)).toEqual([
      "merge",
      "split",
      "undo",
    ]);
    expect(view(state).candidates).toHaveLength(candidateCount);
    expect(approvedOperationalRelations(state, area)).toEqual([]);
    expect(() =>
      undoClusterEvent(
        state,
        "moderator",
        split.id,
        { area, expectedRevision: 6, reason: "Repeat undo" },
        "undo-again",
      ),
    ).toThrow();
  });
  it("never creates transitive identity when A resembles B and B resembles C", () => {
    const state = createDemoState();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        submitReport(state, "alex", {
          pilotId: area,
          category: "community",
          title: `Fictional chain report ${i}`,
          description: "Fictional account with an uncertain time and place.",
          place: "Same approximate Camden area",
          observedAt: new Date(
            Date.parse("2026-09-12T12:00:00Z") + i * 45 * 60_000,
          ).toISOString(),
          synthetic: true,
        }).id,
      );
    generateCandidates(
      state,
      "moderator",
      { area, expectedRevision: 1 },
      "chain-generate",
    );
    expect(active(state)).toHaveLength(2);
    mergeReviewCluster(
      state,
      "moderator",
      {
        area,
        expectedRevision: 2,
        reportIds: ids,
        reason: "Explicit review group only.",
      },
      "chain-group",
    );
    expect(view(state).candidates).toHaveLength(2);
    expect(
      view(state).candidates.some((row) =>
        row.participants.every((p) => [ids[0], ids[2]].includes(p.reportId)),
      ),
    ).toBe(false);
    expect(approvedOperationalRelations(state, area)).toEqual([]);
  });
  it("rejects wrong members and preserves the ledger on failed splits", () => {
    const state = setup(),
      ids = op(state).participants.map((p) => p.reportId);
    mergeReviewCluster(
      state,
      "moderator",
      { area, expectedRevision: 3, reportIds: ids, reason: "Review group." },
      "merge-for-invalid",
    );
    const before = readRelationReview(state),
      group = view(state).clusters[0];
    expect(() =>
      splitReviewCluster(
        state,
        "moderator",
        group.id,
        {
          area,
          expectedRevision: 4,
          partitions: [[ids[0]], [ids[0]]],
          reason: "Duplicate member",
        },
        "duplicate-split",
      ),
    ).toThrow("once");
    expect(readRelationReview(state)).toEqual(before);
  });
});

it("keeps approval and retraction decisions in an immutable review ledger", () => {
  const state = setup(),
    candidate = op(state);
  decideCandidate(
    state,
    "moderator",
    candidate.id,
    {
      area,
      expectedRevision: 3,
      action: "approve",
      reason: "Initial fictional asset review.",
    },
    "approval-ledger",
  );
  const initial = structuredClone(view(state).decisions[0]);
  decideCandidate(
    state,
    "moderator",
    candidate.id,
    {
      area,
      expectedRevision: 4,
      action: "retract",
      reason: "The operational relation is no longer supported.",
    },
    "retraction-ledger",
  );
  expect(view(state).decisions[0]).toEqual(initial);
  expect(view(state).decisions.map((decision) => decision.toStatus)).toEqual([
    "approved",
    "invalidated",
  ]);
  expect(approvedOperationalRelations(state, area)).toEqual([]);
});

it("accepts opaque command keys without prototype collisions", () => {
  const state = createDemoState();
  loadRelationExamples(
    state,
    "moderator",
    { area, expectedRevision: 1 },
    "__proto__",
  );
  loadRelationExamples(
    state,
    "moderator",
    { area, expectedRevision: 1 },
    "__proto__",
  );
  expect(revision(state)).toBe(2);
  expect(state.reports).toHaveLength(9);
});
