import { createHash, randomUUID } from "node:crypto";
import type { DemoState, Notice, PilotId, Report } from "../contracts/index.js";
import {
  DomainError,
  submitReport,
  editReport,
  withdrawReport,
  decideReport,
  findPublicNotice,
} from "../domain/index.js";
import {
  intakeSchema,
  ownerActionSchema,
  reviewActionSchema,
  discussionInputSchema,
  discussionReviewSchema,
  type CommunityWorkflowState,
  type WorkflowActor,
  type WorkflowRecord,
  type Intake,
  type Discussion,
} from "./schema.js";
export * from "./schema.js";
type State = DemoState & { communityWorkflow?: CommunityWorkflowState };
const copy = <T>(value: T): T => structuredClone(value);
const unavailable = () =>
  new DomainError(404, "not_found", "This item is not available.");
const conflict = () =>
  new DomainError(
    409,
    "conflict",
    "This record changed. Reload it before trying again.",
  );
function sidecar(state: State): CommunityWorkflowState {
  return (state.communityWorkflow ??= {
    records: [],
    discussions: [],
    idempotency: [],
  });
}
function readSidecar(state: State): CommunityWorkflowState {
  return (
    state.communityWorkflow ?? { records: [], discussions: [], idempotency: [] }
  );
}
function member(actor: WorkflowActor) {
  if (actor.persona === "moderator")
    throw new DomainError(
      403,
      "unauthorised",
      "Choose a fictional member to submit an observation.",
    );
}
function moderator(actor: WorkflowActor, area: PilotId) {
  if (actor.persona !== "moderator" || !actor.moderatorAreas.includes(area))
    throw unavailable();
}
function reportFor(state: State, record: WorkflowRecord): Report {
  const report = state.reports.find((item) => item.id === record.reportId);
  if (!report) throw unavailable();
  return report;
}
function requireRecord(
  state: State,
  actor: WorkflowActor,
  id: string,
): WorkflowRecord {
  const record = readSidecar(state).records.find((item) => item.id === id);
  if (!record) throw unavailable();
  const report = reportFor(state, record);
  if (actor.persona === "moderator") moderator(actor, report.pilotId);
  else if (report.owner !== actor.persona) throw unavailable();
  return record;
}
function requireVersion(current: number, expected: number) {
  if (current !== expected) throw conflict();
}
function safeText(...values: string[]) {
  const denied =
    /\b(?:case\s*(?:reference|number)|crime\s*reference)\b|\b\d{7,}\b|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b(?:suspect|victim|offender)\s+(?:name|address|identity)\b/i;
  if (values.some((value) => denied.test(value)))
    throw new DomainError(
      400,
      "invalid_input",
      "Use factual text without identities, contact details, or case references.",
    );
}
function validateIntake(input: unknown): Intake {
  const value = intakeSchema.parse(input);
  safeText(value.title, value.place, value.narrative, value.sourceDescription);
  return value;
}
function basic(input: Intake) {
  return {
    pilotId: input.pilotId,
    category: input.category,
    title: input.title,
    place: input.place,
    observedAt: input.observedFrom,
    description: input.narrative || "No optional narrative supplied.",
    synthetic: true as const,
  };
}
function event(
  record: WorkflowRecord,
  actor: WorkflowActor,
  action: string,
  message: string,
) {
  if (record.history.length >= 100)
    throw new DomainError(
      429,
      "rate_limited",
      "This fictional report reached its review limit.",
    );
  record.revision++;
  record.history.push({
    revision: record.revision,
    at: new Date().toISOString(),
    actor: actor.persona === "moderator" ? "moderator" : "member",
    action,
    message,
  });
}
function hideDiscussions(state: State, id: string) {
  for (const item of sidecar(state).discussions.filter(
    (item) => item.workflowId === id,
  )) {
    item.status = "withdrawn";
    item.text = "";
    item.publicSummary = "";
    item.reviewReason = "Parent notice is unavailable.";
    item.revision++;
  }
}
function currentNotice(state: State, record: WorkflowRecord): Notice | null {
  if (
    record.intake.publication !== "reviewed_public" ||
    record.status !== "published"
  )
    return null;
  const id = reportFor(state, record).noticeId;
  if (!id) return null;
  const notice = findPublicNotice(state, id);
  return notice.status === "active" ? notice : null;
}
function idempotent(
  state: State,
  actor: WorkflowActor,
  scope: string,
  key: string,
  input: unknown,
  operation: () => { kind: "workflow" | "discussion"; id: string },
): { kind: "workflow" | "discussion"; id: string } {
  if (key.length < 8 || key.length > 128)
    throw new DomainError(
      400,
      "invalid_input",
      "Supply a bounded idempotency key.",
    );
  const ledger = sidecar(state).idempotency;
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
  const ledgerKey = `${actor.persona}:${scope}:${key}`;
  const old = ledger.find((entry) => entry.key === ledgerKey);
  if (old) {
    if (old.digest !== digest) throw conflict();
    return { kind: old.kind, id: old.id };
  }
  if (ledger.length >= 500)
    throw new DomainError(
      429,
      "rate_limited",
      "This fictional session reached its action limit.",
    );
  const result = operation();
  ledger.push({ key: ledgerKey, digest, ...result });
  return result;
}
export function assertStandardWorkflowAllowed(
  state: DemoState,
  reportId: string,
) {
  if (
    readSidecar(state).records.some(
      (record) =>
        record.reportId === reportId ||
        record.previousReportIds.includes(reportId),
    )
  )
    throw new DomainError(
      409,
      "conflict",
      "Open the community workspace to change this report.",
    );
}
export function workflowReceipt(
  state: State,
  actor: WorkflowActor,
  id: string,
) {
  const record = requireRecord(state, actor, id);
  const report = reportFor(state, record);
  const discussion = readSidecar(state).discussions.filter(
    (item) =>
      item.workflowId === id &&
      (actor.persona === "moderator" || item.owner === actor.persona),
  );
  return copy({
    ...record,
    report,
    notice: currentNotice(state, record),
    discussion,
  });
}
export function listWorkflow(
  state: State,
  actor: WorkflowActor,
  area: PilotId,
) {
  if (actor.persona === "moderator") moderator(actor, area);
  return readSidecar(state)
    .records.filter(
      (record) =>
        record.intake.pilotId === area &&
        (actor.persona === "moderator" ||
          reportFor(state, record).owner === actor.persona),
    )
    .map((record) => workflowReceipt(state, actor, record.id));
}
export function createWorkflow(
  state: State,
  actor: WorkflowActor,
  input: unknown,
  key: string,
) {
  member(actor);
  const value = validateIntake(input);
  const result = idempotent(state, actor, "create", key, value, () => {
    if (sidecar(state).records.length >= 100)
      throw new DomainError(
        429,
        "rate_limited",
        "This fictional session reached its report limit.",
      );
    const report = submitReport(state, actor.persona, basic(value));
    const record: WorkflowRecord = {
      id: randomUUID(),
      reportId: report.id,
      previousReportIds: [],
      revision: 1,
      status: "submitted",
      intake: value,
      createdAt: report.createdAt,
      history: [
        {
          revision: 1,
          at: report.createdAt,
          actor: "member",
          action: "submitted",
          message: "Saved privately for review. No official report was sent.",
        },
      ],
    };
    sidecar(state).records.push(record);
    return { kind: "workflow", id: record.id };
  });
  return workflowReceipt(state, actor, result.id);
}
export function ownerWorkflowAction(
  state: State,
  actor: WorkflowActor,
  id: string,
  input: unknown,
  key: string,
) {
  member(actor);
  requireRecord(state, actor, id);
  const action = ownerActionSchema.parse(input);
  const result = idempotent(state, actor, `owner:${id}`, key, action, () => {
    const record = requireRecord(state, actor, id);
    requireVersion(record.revision, action.expectedRevision);
    const report = reportFor(state, record);
    if (
      ["withdrawn", "retracted", "resolved"].includes(record.status) &&
      action.action !== "withdraw"
    )
      throw conflict();
    if (action.action === "withdraw") {
      withdrawReport(state, actor.persona, report.id, report.revision);
      hideDiscussions(state, id);
      record.status = "withdrawn";
      record.intake = {
        ...record.intake,
        title: "Withdrawn observation",
        place: "Approximate place removed",
        narrative: "",
        sourceDescription:
          record.intake.basis === "other_source" ? "Source detail removed" : "",
      };
      record.history = [];
      event(
        record,
        actor,
        "withdrawn",
        "Private narrative and derived public content were removed.",
      );
    } else if (action.action === "respond") {
      if (record.status !== "needs_clarification") throw conflict();
      safeText(action.message);
      record.status = report.noticeId ? "correction_pending" : "submitted";
      event(record, actor, "clarification_response", action.message);
    } else if (action.action === "appeal") {
      if (record.status !== "rejected") throw conflict();
      safeText(action.message);
      record.status = "appealed";
      event(record, actor, "appeal", action.message);
    } else {
      const changes = validateIntake(action.changes);
      if (changes.pilotId !== record.intake.pilotId)
        throw new DomainError(
          400,
          "invalid_input",
          "A correction must keep the original pilot area.",
        );
      if (record.previousReportIds.length >= 20)
        throw new DomainError(
          429,
          "rate_limited",
          "This fictional report reached its correction limit.",
        );
      if (report.noticeId || report.status !== "submitted") {
        withdrawReport(state, actor.persona, report.id, report.revision);
        hideDiscussions(state, id);
        record.previousReportIds.push(report.id);
        record.reportId = submitReport(state, actor.persona, basic(changes)).id;
      } else {
        const { pilotId: _pilot, ...update } = basic(changes);
        editReport(state, actor.persona, report.id, {
          expectedRevision: report.revision,
          action: "edit",
          changes: update,
        });
      }
      record.intake = changes;
      record.status = "correction_pending";
      event(
        record,
        actor,
        "correction_requested",
        "Correction saved privately. Any previous public summary was withdrawn pending review.",
      );
    }
    return { kind: "workflow", id };
  });
  return workflowReceipt(state, actor, result.id);
}
export function reviewWorkflow(
  state: State,
  actor: WorkflowActor,
  id: string,
  input: unknown,
  key: string,
) {
  const first = requireRecord(state, actor, id);
  moderator(actor, first.intake.pilotId);
  const action = reviewActionSchema.parse(input);
  safeText(action.reason, action.publicSummary);
  const result = idempotent(state, actor, `review:${id}`, key, action, () => {
    const record = requireRecord(state, actor, id);
    requireVersion(record.revision, action.expectedRevision);
    const report = reportFor(state, record);
    if (["withdrawn", "resolved", "retracted"].includes(record.status))
      throw conflict();
    if (action.action === "resolve" || action.action === "retract") {
      if (record.status !== "published" || action.publicSummary.length < 5)
        throw conflict();
      decideReport(state, actor.persona, report.id, {
        expectedRevision: report.revision,
        action: action.action,
        summary: action.publicSummary,
      });
      record.status = action.action === "resolve" ? "resolved" : "retracted";
      hideDiscussions(state, id);
    } else {
      if (record.status === "published") throw conflict();
      if (
        action.action === "approve" &&
        (record.intake.publication !== "reviewed_public" ||
          action.publicSummary.length < 5)
      )
        throw new DomainError(
          409,
          "conflict",
          "Publication requires the owner's preference and a reviewed summary.",
        );
      if (
        action.action === "review_private" &&
        record.intake.publication !== "private_only"
      )
        throw conflict();
      if (report.status === "rejected") {
        if (record.status !== "appealed") throw conflict();
        report.status = "submitted";
        report.revision++;
      }
      if (action.action === "start_review") record.status = "in_review";
      if (action.action === "clarify") record.status = "needs_clarification";
      if (action.action === "review_private")
        record.status = "private_reviewed";
      if (action.action === "approve") {
        decideReport(state, actor.persona, report.id, {
          expectedRevision: report.revision,
          action: "approve",
          summary: action.publicSummary,
        });
        record.status = "published";
        const published = state.notices.find(
          (item) => item.id === report.noticeId,
        )!;
        const sourceKind =
          record.intake.basis === "other_source"
            ? "community_other_source"
            : "community_firsthand";
        Object.assign(published, { sourceKind });
        for (const evidence of published.evidence)
          Object.assign(evidence, {
            sourceKind,
            label:
              record.intake.basis === "other_source"
                ? "Reviewed fictional other-source contribution"
                : "Reviewed fictional firsthand contribution",
          });
      }
      if (action.action === "reject") {
        decideReport(state, actor.persona, report.id, {
          expectedRevision: report.revision,
          action: "reject",
          summary: action.reason,
        });
        record.status = "rejected";
      }
    }
    event(record, actor, action.action, action.reason);
    return { kind: "workflow", id };
  });
  return workflowReceipt(state, actor, result.id);
}
export function publicWorkflow(state: State, area: PilotId) {
  return readSidecar(state)
    .records.filter((record) => record.intake.pilotId === area)
    .flatMap((record) => {
      const notice = currentNotice(state, record);
      if (!notice) return [];
      return [
        {
          notice,
          basis: record.intake.basis,
          observedInterval: {
            from: record.intake.observedFrom,
            to: record.intake.observedTo,
            precision: record.intake.timePrecision,
          },
          updates: readSidecar(state)
            .discussions.filter(
              (item) =>
                item.workflowId === record.id && item.status === "approved",
            )
            .map((item) => ({
              id: item.id,
              revision: item.revision,
              summary: item.publicSummary,
              createdAt: item.createdAt,
              synthetic: true as const,
            })),
        },
      ];
    });
}
export function submitDiscussion(
  state: State,
  actor: WorkflowActor,
  noticeId: string,
  input: unknown,
  key: string,
) {
  member(actor);
  const action = discussionInputSchema.parse(input);
  safeText(action.text);
  const result = idempotent(
    state,
    actor,
    `discussion:${noticeId}`,
    key,
    action,
    () => {
      const record = readSidecar(state).records.find(
        (item) => reportFor(state, item).noticeId === noticeId,
      );
      if (!record) throw unavailable();
      const notice = currentNotice(state, record);
      if (!notice) throw unavailable();
      requireVersion(notice.revision, action.expectedRevision);
      if (sidecar(state).discussions.length >= 200)
        throw new DomainError(
          429,
          "rate_limited",
          "This session reached its discussion limit.",
        );
      const item: Discussion = {
        id: randomUUID(),
        workflowId: record.id,
        owner: actor.persona,
        revision: 1,
        status: "submitted",
        text: action.text,
        publicSummary: "",
        reviewReason: "",
        createdAt: new Date().toISOString(),
      };
      sidecar(state).discussions.push(item);
      return { kind: "discussion", id: item.id };
    },
  );
  return discussionReceipt(state, actor, result.id);
}
export function discussionReceipt(
  state: State,
  actor: WorkflowActor,
  id: string,
) {
  const item = readSidecar(state).discussions.find((entry) => entry.id === id);
  if (!item) throw unavailable();
  const record = readSidecar(state).records.find(
    (entry) => entry.id === item.workflowId,
  );
  if (!record) throw unavailable();
  if (actor.persona === "moderator") moderator(actor, record.intake.pilotId);
  else if (item.owner !== actor.persona) throw unavailable();
  return copy(item);
}
export function reviewDiscussion(
  state: State,
  actor: WorkflowActor,
  id: string,
  input: unknown,
  key: string,
) {
  const old = discussionReceipt(state, actor, id);
  const parent = readSidecar(state).records.find(
    (item) => item.id === old.workflowId,
  )!;
  moderator(actor, parent.intake.pilotId);
  const action = discussionReviewSchema.parse(input);
  safeText(action.reason, action.publicSummary);
  const result = idempotent(
    state,
    actor,
    `discussion-review:${id}`,
    key,
    action,
    () => {
      const item = sidecar(state).discussions.find((entry) => entry.id === id)!;
      requireVersion(item.revision, action.expectedRevision);
      if (item.status !== "submitted" || !currentNotice(state, parent))
        throw conflict();
      if (action.action === "approve" && action.publicSummary.length < 5)
        throw new DomainError(
          400,
          "invalid_input",
          "Write a public-safe summary before approval.",
        );
      item.status = action.action === "approve" ? "approved" : "rejected";
      item.publicSummary =
        action.action === "approve" ? action.publicSummary : "";
      item.reviewReason = action.reason;
      item.revision++;
      return { kind: "discussion", id };
    },
  );
  return discussionReceipt(state, actor, result.id);
}
export function withdrawDiscussion(
  state: State,
  actor: WorkflowActor,
  id: string,
  expectedRevision: number,
  key: string,
) {
  member(actor);
  discussionReceipt(state, actor, id);
  const result = idempotent(
    state,
    actor,
    `discussion-withdraw:${id}`,
    key,
    { expectedRevision },
    () => {
      const item = sidecar(state).discussions.find((entry) => entry.id === id)!;
      requireVersion(item.revision, expectedRevision);
      item.status = "withdrawn";
      item.text = "";
      item.publicSummary = "";
      item.reviewReason = "Withdrawn by its contributor.";
      item.revision++;
      return { kind: "discussion", id };
    },
  );
  return discussionReceipt(state, actor, result.id);
}
export function listDiscussions(
  state: State,
  actor: WorkflowActor,
  area: PilotId,
) {
  if (actor.persona === "moderator") moderator(actor, area);
  const ids = new Set(
    readSidecar(state)
      .records.filter((item) => item.intake.pilotId === area)
      .map((item) => item.id),
  );
  return readSidecar(state)
    .discussions.filter(
      (item) =>
        ids.has(item.workflowId) &&
        (actor.persona === "moderator" || item.owner === actor.persona),
    )
    .map(copy);
}
export function noticeShare(
  state: State,
  noticeId: string,
  expectedRevision?: number,
) {
  const record = readSidecar(state).records.find(
    (item) => reportFor(state, item).noticeId === noticeId,
  );
  const notice = record ? currentNotice(state, record) : null;
  if (!notice) throw unavailable();
  if (expectedRevision !== undefined)
    requireVersion(notice.revision, expectedRevision);
  return {
    notice,
    path: `/?demo=1&workspace=community&area=${notice.pilotId}&notice=${notice.id}`,
    synthetic: true as const,
  };
}
