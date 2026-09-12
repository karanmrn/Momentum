import { describe, it, expect } from "vitest";
import {
  createDemoState,
  listPublicNotices,
} from "../../packages/domain/index.js";
import {
  createWorkflow,
  ownerWorkflowAction,
  reviewWorkflow,
  publicWorkflow,
  submitDiscussion,
  reviewDiscussion,
  noticeShare,
  listWorkflow,
  listDiscussions,
  assertStandardWorkflowAllowed,
  type WorkflowActor,
} from "../../packages/community-workflow/index.js";
const alex: WorkflowActor = { persona: "alex", moderatorAreas: [] };
const sam: WorkflowActor = { persona: "sam", moderatorAreas: [] };
const moderator: WorkflowActor = {
  persona: "moderator",
  moderatorAreas: ["camden_town"],
};
const intake = {
  pilotId: "camden_town",
  category: "infrastructure",
  title: "Fictional lighting observation",
  place: "Camden station approach",
  observedFrom: "2026-09-12T20:00:00Z",
  observedTo: "2026-09-12T21:00:00Z",
  timePrecision: "time_window",
  basis: "firsthand",
  narrative: "",
  publication: "reviewed_public",
  synthetic: true,
};
let keys = 0;
const key = () => `test-key-${++keys}`;
function approve(
  state: ReturnType<typeof createDemoState>,
  record: ReturnType<typeof createWorkflow>,
) {
  return reviewWorkflow(
    state,
    moderator,
    record.id,
    {
      expectedRevision: record.revision,
      action: "approve",
      reason: "Fictional publication review completed.",
      publicSummary:
        "A fictional contributor reports reduced lighting. Current conditions remain unconfirmed.",
    },
    key(),
  );
}

describe("advanced fictional community workflow", () => {
  it("keeps intake private, supports clarification, then publishes only a reviewed summary", () => {
    const state = createDemoState();
    const record = createWorkflow(state, alex, intake, key());
    expect(record.intake.narrative).toBe("");
    expect(record.intake.timePrecision).toBe("time_window");
    expect(publicWorkflow(state, "camden_town")).toEqual([]);
    const query = reviewWorkflow(
      state,
      moderator,
      record.id,
      {
        expectedRevision: 1,
        action: "clarify",
        reason: "Please describe the approximate observation interval.",
      },
      key(),
    );
    expect(query.status).toBe("needs_clarification");
    const response = ownerWorkflowAction(
      state,
      alex,
      record.id,
      {
        expectedRevision: query.revision,
        action: "respond",
        message: "The observation occurred within the stated hour.",
      },
      key(),
    );
    const published = approve(state, response);
    expect(published.status).toBe("published");
    const visible = publicWorkflow(state, "camden_town");
    expect(visible).toHaveLength(1);
    expect(JSON.stringify(visible)).not.toContain("stated hour");
    expect(JSON.stringify(visible)).not.toContain(record.report.id);
    expect(visible[0].notice.summary).toContain(
      "Current conditions remain unconfirmed",
    );
  });
  it("blocks publication of private-only reports and supports rejection with a private appeal", () => {
    const state = createDemoState();
    const original = createWorkflow(
      state,
      alex,
      { ...intake, publication: "private_only" },
      key(),
    );
    expect(() => approve(state, original)).toThrow(/owner's preference/);
    const rejected = reviewWorkflow(
      state,
      moderator,
      original.id,
      {
        expectedRevision: 1,
        action: "reject",
        reason: "The fictional description needs clarification.",
      },
      key(),
    );
    const appealed = ownerWorkflowAction(
      state,
      alex,
      rejected.id,
      {
        expectedRevision: rejected.revision,
        action: "appeal",
        message: "Please review the provided observation interval again.",
      },
      key(),
    );
    const reviewed = reviewWorkflow(
      state,
      moderator,
      appealed.id,
      {
        expectedRevision: appealed.revision,
        action: "review_private",
        reason: "The private review is complete. Nothing was published.",
      },
      key(),
    );
    expect(reviewed.status).toBe("private_reviewed");
    expect(publicWorkflow(state, "camden_town")).toEqual([]);
    expect(() =>
      assertStandardWorkflowAllowed(state, original.report.id),
    ).toThrow(/community workspace/);
  });
  it("post-publication correction suppresses old links and discussion until new review", () => {
    const state = createDemoState();
    const original = approve(state, createWorkflow(state, alex, intake, key()));
    const oldNotice = original.notice!.id;
    const comment = submitDiscussion(
      state,
      sam,
      oldNotice,
      {
        expectedRevision: 1,
        text: "Fictional follow-up observation with private details.",
      },
      key(),
    );
    expect(publicWorkflow(state, "camden_town")[0].updates).toEqual([]);
    reviewDiscussion(
      state,
      moderator,
      comment.id,
      {
        expectedRevision: 1,
        action: "approve",
        reason: "Reviewed with identifying details removed.",
        publicSummary: "A fictional follow-up describes the same broad area.",
      },
      key(),
    );
    expect(publicWorkflow(state, "camden_town")[0].updates).toHaveLength(1);
    const correction = ownerWorkflowAction(
      state,
      alex,
      original.id,
      {
        expectedRevision: original.revision,
        action: "correct",
        changes: {
          ...intake,
          observedTo: "2026-09-12T20:30:00Z",
          narrative: "A fictional correction to the observation interval.",
        },
      },
      key(),
    );
    expect(correction.status).toBe("correction_pending");
    expect(publicWorkflow(state, "camden_town")).toEqual([]);
    expect(() => noticeShare(state, oldNotice)).toThrow("not available");
    expect(listDiscussions(state, sam, "camden_town")[0].text).toBe("");
    const next = approve(state, correction);
    expect(next.notice!.id).not.toBe(oldNotice);
    expect(publicWorkflow(state, "camden_town")[0].updates).toEqual([]);
    expect(noticeShare(state, next.notice!.id).path).not.toContain("narrative");
  });
  it("withdrawal scrubs narrative and replay returns the current safe receipt", () => {
    const state = createDemoState();
    const token = key();
    const original = createWorkflow(
      state,
      alex,
      { ...intake, narrative: "Fictional private narrative for the test." },
      token,
    );
    const removed = ownerWorkflowAction(
      state,
      alex,
      original.id,
      { expectedRevision: 1, action: "withdraw" },
      key(),
    );
    expect(removed.report.description).toBe("[withdrawn]");
    expect(removed.intake.narrative).toBe("");
    expect(
      createWorkflow(
        state,
        alex,
        { ...intake, narrative: "Fictional private narrative for the test." },
        token,
      ).status,
    ).toBe("withdrawn");
    expect(
      JSON.stringify(listWorkflow(state, alex, "camden_town")),
    ).not.toContain("private narrative for the test");
  });
  it("rejects forged roles, cross-owner reads, unscoped reviewers, and nested idempotency changes", () => {
    const state = createDemoState();
    const original = createWorkflow(state, alex, intake, key());
    expect(listWorkflow(state, sam, "camden_town")).toEqual([]);
    expect(() =>
      ownerWorkflowAction(
        state,
        sam,
        original.id,
        { action: "withdraw", expectedRevision: 1 },
        key(),
      ),
    ).toThrow("not available");
    expect(() =>
      reviewWorkflow(
        state,
        { persona: "moderator", moderatorAreas: ["west_croydon"] },
        original.id,
        {
          action: "reject",
          expectedRevision: 1,
          reason: "Not authorised in this pilot area.",
        },
        key(),
      ),
    ).toThrow("not available");
    expect(() =>
      createWorkflow(state, alex, { ...intake, moderator: true }, key()),
    ).toThrow();
    const token = key();
    const correction = {
      action: "correct",
      expectedRevision: 1,
      changes: { ...intake, narrative: "First fictional changed narrative." },
    };
    ownerWorkflowAction(state, alex, original.id, correction, token);
    expect(() =>
      ownerWorkflowAction(
        state,
        alex,
        original.id,
        {
          ...correction,
          changes: {
            ...intake,
            narrative: "Different fictional changed narrative.",
          },
        },
        token,
      ),
    ).toThrow(/changed/);
  });
  it("validates interval order, bounded narrative, source distinction, and identity restrictions", () => {
    const state = createDemoState();
    for (const input of [
      { ...intake, observedTo: "2026-09-11T21:00:00Z" },
      { ...intake, basis: "other_source" },
      { ...intake, narrative: "x".repeat(601) },
      { ...intake, narrative: "Contact private@example.com for this report." },
    ])
      expect(() => createWorkflow(state, alex, input, key())).toThrow();
    const external = createWorkflow(
      state,
      alex,
      {
        ...intake,
        basis: "other_source",
        sourceDescription: "A fictional public source description.",
      },
      key(),
    );
    expect(external.intake.basis).toBe("other_source");
  });
  it("rejects stale revisions and suppresses updates and shares after retraction", () => {
    const state = createDemoState();
    const record = approve(state, createWorkflow(state, alex, intake, key()));
    expect(() => noticeShare(state, record.notice!.id, 5)).toThrow(/changed/);
    reviewWorkflow(
      state,
      moderator,
      record.id,
      {
        expectedRevision: record.revision,
        action: "retract",
        reason: "The fictional source was withdrawn.",
        publicSummary: "This fictional community summary was retracted.",
      },
      key(),
    );
    expect(publicWorkflow(state, "camden_town")).toEqual([]);
    expect(() =>
      submitDiscussion(
        state,
        sam,
        record.notice!.id,
        {
          expectedRevision: 1,
          text: "This stale discussion must not be published.",
        },
        key(),
      ),
    ).toThrow("not available");
    expect(
      listPublicNotices(state, "camden_town").some(
        (item) => item.id === record.notice!.id,
      ),
    ).toBe(false);
  });
});
