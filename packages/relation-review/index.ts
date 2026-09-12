import { createHash, randomUUID } from "node:crypto";
import { relationReportContentHash as contentHash } from "./publication.js";
import { currentCommunityInterval } from "./community-interval.js";
import type {
  DemoState,
  Persona,
  PilotId,
  Report,
} from "../contracts/index.js";
import { DomainError, submitReport } from "../domain/index.js";
import {
  baseActionSchema,
  decisionActionSchema,
  mergeActionSchema,
  splitActionSchema,
  undoActionSchema,
  relationReviewStateSchema,
  commandKeySchema,
  candidateIdSchema,
  objectIdSchema,
  type RelationReviewState,
  type RelationCandidate,
  type RelationParticipant,
  type ReviewCluster,
} from "./schema.js";
export type { RelationReviewState } from "./schema.js";
type State = DemoState & { relationReview?: RelationReviewState };
const MAX_INPUT_REPORTS = 40,
  MAX_NEW_CANDIDATES = 40;
export function defaultRelationReview(): RelationReviewState {
  return {
    version: "1.0",
    revision: 1,
    qualifications: [],
    candidates: [],
    decisions: [],
    clusters: [],
    events: [],
    examplesLoaded: [],
    commands: {},
  };
}
export function readRelationReview(state: State): RelationReviewState {
  return state.relationReview
    ? relationReviewStateSchema.parse(state.relationReview)
    : defaultRelationReview();
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function moderator(actor: Persona) {
  if (actor !== "moderator")
    throw new DomainError(
      403,
      "unauthorised",
      "This view requires the demonstration moderator.",
    );
}
function conflict(
  message = "This review changed. Refresh and try again.",
): never {
  throw new DomainError(409, "conflict", message);
}
function notFound(): never {
  throw new DomainError(404, "not_found", "This review item is unavailable.");
}
function currentReport(state: State, id: string, area: PilotId) {
  return state.reports.find(
    (report) =>
      report.id === id &&
      report.pilotId === area &&
      report.synthetic === true &&
      ["submitted", "approved_for_summary"].includes(report.status),
  );
}
function validCandidate(state: State, candidate: RelationCandidate) {
  return candidate.participants.every((participant) => {
    const report = currentReport(
      state,
      participant.reportId,
      candidate.pilotId,
    );
    return report && report.revision === participant.reportRevision;
  });
}
function effective(
  state: State,
  review: RelationReviewState,
  recordedAt?: string,
) {
  const copy = structuredClone(review);
  for (const candidate of copy.candidates)
    if (
      !validCandidate(state, candidate) &&
      candidate.status !== "invalidated"
    ) {
      candidate.status = "invalidated";
      if (recordedAt) candidate.retiredAt ??= recordedAt;
    }
  return copy;
}
export function relationReviewView(
  state: State,
  actor: Persona,
  area: PilotId,
) {
  moderator(actor);
  const review = effective(state, readRelationReview(state));
  return {
    revision: review.revision,
    area,
    synthetic: true as const,
    candidates: review.candidates.filter(
      (candidate) => candidate.pilotId === area,
    ),
    decisions: review.decisions.filter((decision) => decision.pilotId === area),
    clusters: review.clusters.filter((cluster) => cluster.pilotId === area),
    events: review.events.filter((event) => event.pilotId === area),
    reports: state.reports
      .filter(
        (report) =>
          report.pilotId === area &&
          report.synthetic === true &&
          report.status !== "withdrawn",
      )
      .map(
        ({
          id,
          revision,
          title,
          description,
          place,
          category,
          observedAt,
          status,
        }) => ({
          id,
          revision,
          title,
          description,
          place,
          category,
          observedAt,
          status,
        }),
      ),
    examplesLoaded: review.examplesLoaded.includes(area),
    limitations: [
      "Fictional review only. Grouping does not establish one incident or independent corroboration.",
      "Generation examines at most 40 current reports and adds at most 40 candidate pairs.",
      "Free-text places remain approximate. Only the labelled asset examples have asset references.",
      "Changed, rejected, or withdrawn reports invalidate their previous candidate decisions.",
    ],
  };
}
export type RelationReviewView = ReturnType<typeof relationReviewView>;
function execute(
  state: State,
  actor: Persona,
  keyInput: string,
  command: unknown,
  expectedRevision: number,
  operation: (review: RelationReviewState) => void,
) {
  moderator(actor);
  const key = `command:${commandKeySchema.parse(keyInput)}`;
  const review = effective(
    state,
    readRelationReview(state),
    new Date().toISOString(),
  );
  const fingerprint = hash(command),
    existing = review.commands[key];
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      conflict("This request key was already used for a different action.");
    return;
  }
  if (review.revision !== expectedRevision) conflict();
  if (Object.keys(review.commands).length >= 150)
    throw new DomainError(
      429,
      "rate_limited",
      "This fictional review reached its action limit.",
    );
  operation(review);
  review.revision += 1;
  review.commands[key] = { fingerprint, revision: review.revision };
  state.relationReview = relationReviewStateSchema.parse(review);
}
function participant(
  state: State,
  review: RelationReviewState,
  report: Report,
): RelationParticipant {
  const qualification = review.qualifications.find(
    (row) =>
      row.reportId === report.id && row.contentHash === contentHash(report),
  );
  const intakeInterval = currentCommunityInterval(state, report);
  return {
    reportId: report.id,
    reportRevision: report.revision,
    sourceFamilyId:
      qualification?.sourceFamilyId ?? "streetwise-demo-community",
    originGroupId: qualification?.originGroupId ?? null,
    spatialPrecision: qualification?.spatialPrecision ?? "approximate_place",
    assetId: qualification?.assetId ?? null,
    observedFrom:
      qualification?.observedFrom ??
      intakeInterval?.observedFrom ??
      report.observedAt,
    observedTo:
      qualification?.observedTo ??
      intakeInterval?.observedTo ??
      report.observedAt,
    timePrecision:
      qualification?.timePrecision ??
      intakeInterval?.timePrecision ??
      "reported_point",
  };
}
const normalizePlace = (value: string) =>
  value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
function pair(
  state: State,
  review: RelationReviewState,
  left: Report,
  right: Report,
): RelationCandidate | null {
  if (left.pilotId !== right.pilotId || left.category !== right.category)
    return null;
  const participants = [
    participant(state, review, left),
    participant(state, review, right),
  ] as [RelationParticipant, RelationParticipant];
  const [a, b] = participants;
  const sameAsset = a.assetId !== null && a.assetId === b.assetId;
  const samePlace = normalizePlace(left.place) === normalizePlace(right.place);
  if (!sameAsset && !samePlace) return null;
  const from = Math.max(Date.parse(a.observedFrom), Date.parse(b.observedFrom)),
    to = Math.min(Date.parse(a.observedTo), Date.parse(b.observedTo));
  const intervals =
    a.timePrecision !== "reported_point" &&
    b.timePrecision !== "reported_point";
  const overlaps = from <= to;
  if (
    intervals
      ? !overlaps
      : Math.abs(Date.parse(left.observedAt) - Date.parse(right.observedAt)) >
        60 * 60_000
  )
    return null;
  const shared =
    a.originGroupId !== null && a.originGroupId === b.originGroupId;
  return {
    id: `candidate:${hash(participants.map((p) => [p.reportId, p.reportRevision])).slice(0, 32)}`,
    pilotId: left.pilotId,
    participants,
    category: left.category,
    status: "candidate",
    predicate: "POSSIBLE_DUPLICATE_OF",
    reasonCodes: [
      "compatible_category",
      sameAsset
        ? "same_fictional_asset_reference"
        : "same_approximate_place_text",
      intervals && overlaps
        ? "overlapping_reported_intervals"
        : "reported_points_within_one_hour_not_exact_overlap",
      shared
        ? "shared_original_source_not_independent"
        : "independence_unknown",
      ...(sameAsset ? [] : ["precision_inadequate_for_operational_relation"]),
    ],
    independence: shared ? "shared_origin" : "unknown",
    methodVersion: "fictional-relations/1",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerRole: null,
    decisionReason: null,
    retiredAt: null,
    synthetic: true,
    visibility: "moderator_private",
  };
}
export function generateCandidates(
  state: State,
  actor: Persona,
  input: unknown,
  key: string,
) {
  const action = baseActionSchema.parse(input);
  execute(
    state,
    actor,
    key,
    { operation: "generate", ...action },
    action.expectedRevision,
    (review) => {
      const reports = state.reports
        .filter((report) => currentReport(state, report.id, action.area))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, MAX_INPUT_REPORTS);
      let added = 0;
      for (let a = 0; a < reports.length; a++)
        for (let b = a + 1; b < reports.length; b++) {
          if (added >= MAX_NEW_CANDIDATES || review.candidates.length >= 100)
            return;
          const candidate = pair(state, review, reports[a], reports[b]);
          if (
            candidate &&
            !review.candidates.some((row) => row.id === candidate.id)
          ) {
            review.candidates.push(candidate);
            added++;
          }
        }
    },
  );
  return relationReviewView(state, actor, action.area);
}
export function loadRelationExamples(
  state: State,
  actor: Persona,
  input: unknown,
  key: string,
) {
  const action = baseActionSchema.parse(input);
  execute(
    state,
    actor,
    key,
    { operation: "examples", ...action },
    action.expectedRevision,
    (review) => {
      if (review.examplesLoaded.includes(action.area))
        conflict("These fictional examples are already loaded.");
      if (state.reports.length > 96)
        throw new DomainError(
          429,
          "rate_limited",
          "This session has no room for four fictional reports.",
        );
      const from = new Date(Date.now() - 60 * 60_000).toISOString(),
        to = new Date(Date.now() - 30 * 60_000).toISOString();
      const entries = [
        {
          title: "Fictional lamp report A",
          description:
            "Fictional firsthand account of reduced lighting at the demonstration lamp.",
          origin: "original-a",
          sourceKind: "community_firsthand" as const,
          asset: "lamp-one",
        },
        {
          title: "Fictional copied lamp account",
          description:
            "Fictional copied account repeating lamp report A. This is not another independent source.",
          origin: "original-a",
          sourceKind: "community_other_source" as const,
          asset: "lamp-one",
        },
        {
          title: "Fictional lamp report B",
          description:
            "Fictional separate account of flickering at the demonstration lamp. Independence remains unknown.",
          origin: "original-b",
          sourceKind: "community_firsthand" as const,
          asset: "lamp-one",
        },
        {
          title: "Fictional different lamp report",
          description:
            "Fictional account at another lamp. Matching a broad area cannot establish the same asset.",
          origin: "original-c",
          sourceKind: "community_firsthand" as const,
          asset: "lamp-two",
        },
      ];
      for (const entry of entries) {
        const report = submitReport(state, "alex", {
          pilotId: action.area,
          category: "infrastructure",
          title: entry.title,
          description: entry.description,
          place: `Fictional ${entry.asset} in ${action.area}`,
          observedAt: from,
          synthetic: true,
        });
        review.qualifications.push({
          reportId: report.id,
          contentHash: contentHash(report),
          sourceKind: entry.sourceKind,
          sourceFamilyId: "streetwise-fictional-relations",
          originGroupId: `${action.area}:${entry.origin}`,
          spatialPrecision: "fictional_asset_reference",
          assetId: `fictional-asset:${action.area}:${entry.asset}`,
          observedFrom: from,
          observedTo: to,
          timePrecision: "fictional_reported_interval",
        });
      }
      review.examplesLoaded.push(action.area);
    },
  );
  return relationReviewView(state, actor, action.area);
}
export function decideCandidate(
  state: State,
  actor: Persona,
  idInput: string,
  input: unknown,
  key: string,
) {
  const id = candidateIdSchema.parse(idInput),
    action = decisionActionSchema.parse(input);
  execute(
    state,
    actor,
    key,
    { operation: "decision", id, ...action },
    action.expectedRevision,
    (review) => {
      const candidate = review.candidates.find(
        (row) => row.id === id && row.pilotId === action.area,
      );
      if (!candidate) notFound();
      if (
        candidate.status === "invalidated" ||
        !validCandidate(state, candidate)
      )
        conflict(
          "A source report changed. Generate and review a new candidate.",
        );
      const fromStatus = candidate.status;
      if (action.action === "retract") {
        if (candidate.status !== "approved")
          conflict("Only an approved operational relation can be retracted.");
        candidate.status = "invalidated";
        candidate.retiredAt = new Date().toISOString();
      } else {
        if (candidate.status !== "candidate")
          conflict("This candidate already has a decision.");
        if (action.action === "approve") {
          const [a, b] = candidate.participants;
          if (
            !["infrastructure", "access"].includes(candidate.category) ||
            !a.assetId ||
            a.assetId !== b.assetId ||
            a.spatialPrecision !== "fictional_asset_reference" ||
            b.spatialPrecision !== "fictional_asset_reference" ||
            a.timePrecision !== "fictional_reported_interval" ||
            b.timePrecision !== "fictional_reported_interval" ||
            candidate.independence === "shared_origin"
          )
            conflict(
              "This pair lacks distinct source lineage and matching asset intervals. Keep it as a review candidate.",
            );
          candidate.status = "approved";
          candidate.predicate = "SAME_OPERATIONAL_ISSUE_AS";
        } else candidate.status = "rejected";
      }
      candidate.reviewedAt = new Date().toISOString();
      candidate.reviewerRole = "moderator";
      candidate.decisionReason = action.reason;
      review.decisions.push({
        id: randomUUID(),
        candidateId: candidate.id,
        pilotId: action.area,
        fromStatus,
        toStatus: candidate.status,
        at: candidate.reviewedAt,
        actorRole: "moderator",
        reason: action.reason,
      });
    },
  );
  return relationReviewView(state, actor, action.area);
}
function reportIdsAllowed(state: State, area: PilotId, ids: string[]) {
  if (new Set(ids).size !== ids.length)
    throw new DomainError(400, "invalid_input", "Use each report once.");
  if (ids.some((id) => !currentReport(state, id, area))) notFound();
}
function clusterCapacity(review: RelationReviewState) {
  if (review.events.length >= 100)
    throw new DomainError(
      429,
      "rate_limited",
      "This review reached its cluster history limit.",
    );
}
export function mergeReviewCluster(
  state: State,
  actor: Persona,
  input: unknown,
  key: string,
) {
  const action = mergeActionSchema.parse(input);
  execute(
    state,
    actor,
    key,
    { operation: "merge", ...action },
    action.expectedRevision,
    (review) => {
      clusterCapacity(review);
      reportIdsAllowed(state, action.area, action.reportIds);
      const connected = review.candidates.filter(
        (candidate) =>
          candidate.pilotId === action.area &&
          ["candidate", "approved"].includes(candidate.status) &&
          validCandidate(state, candidate) &&
          candidate.participants.every((p) =>
            action.reportIds.includes(p.reportId),
          ),
      );
      if (
        action.reportIds.some(
          (id) =>
            !connected.some((candidate) =>
              candidate.participants.some((p) => p.reportId === id),
            ),
        )
      )
        conflict(
          "Each selected report needs an active candidate within this review group.",
        );
      const before = review.clusters.filter(
        (cluster) =>
          cluster.pilotId === action.area &&
          cluster.reportIds.some((id) => action.reportIds.includes(id)),
      );
      if (
        before.some((cluster) =>
          cluster.reportIds.some((id) => !action.reportIds.includes(id)),
        )
      )
        conflict("Select every member of an existing group before merging it.");
      const after: ReviewCluster[] = [
        {
          id: randomUUID(),
          pilotId: action.area,
          reportIds: [...action.reportIds].sort(),
          revision: 1,
        },
      ];
      const beforeIds = new Set(before.map((cluster) => cluster.id));
      if (review.clusters.length - before.length + 1 > 30)
        throw new DomainError(
          429,
          "rate_limited",
          "This review reached its group limit.",
        );
      review.clusters = review.clusters
        .filter((cluster) => !beforeIds.has(cluster.id))
        .concat(after);
      review.events.push({
        id: randomUUID(),
        pilotId: action.area,
        action: "merge",
        at: new Date().toISOString(),
        actorRole: "moderator",
        before,
        after,
        undoesEventId: null,
        reason: action.reason,
      });
    },
  );
  return relationReviewView(state, actor, action.area);
}
export function splitReviewCluster(
  state: State,
  actor: Persona,
  idInput: string,
  input: unknown,
  key: string,
) {
  const id = objectIdSchema.parse(idInput),
    action = splitActionSchema.parse(input);
  execute(
    state,
    actor,
    key,
    { operation: "split", id, ...action },
    action.expectedRevision,
    (review) => {
      clusterCapacity(review);
      const cluster = review.clusters.find(
        (row) => row.id === id && row.pilotId === action.area,
      );
      if (!cluster) notFound();
      const ids = action.partitions.flat();
      // Splitting changes stored grouping only. Retired source references can still be removed.
      if (new Set(ids).size !== ids.length)
        throw new DomainError(400, "invalid_input", "Use each report once.");
      if ([...ids].sort().join(",") !== [...cluster.reportIds].sort().join(","))
        conflict("The split must include every current member exactly once.");
      const after = action.partitions
        .filter((group) => group.length > 1)
        .map((reportIds) => ({
          id: randomUUID(),
          pilotId: action.area,
          reportIds: [...reportIds].sort(),
          revision: 1,
        }));
      if (review.clusters.length - 1 + after.length > 30)
        throw new DomainError(
          429,
          "rate_limited",
          "This review reached its group limit.",
        );
      review.clusters = review.clusters
        .filter((row) => row.id !== id)
        .concat(after);
      review.events.push({
        id: randomUUID(),
        pilotId: action.area,
        action: "split",
        at: new Date().toISOString(),
        actorRole: "moderator",
        before: [cluster],
        after,
        undoesEventId: null,
        reason: action.reason,
      });
    },
  );
  return relationReviewView(state, actor, action.area);
}
export function undoClusterEvent(
  state: State,
  actor: Persona,
  idInput: string,
  input: unknown,
  key: string,
) {
  const id = objectIdSchema.parse(idInput),
    action = undoActionSchema.parse(input);
  execute(
    state,
    actor,
    key,
    { operation: "undo", id, ...action },
    action.expectedRevision,
    (review) => {
      clusterCapacity(review);
      const latest = review.events
        .filter((event) => event.pilotId === action.area)
        .at(-1);
      if (!latest || latest.id !== id) notFound();
      if (latest.action === "undo")
        conflict("The latest change was already undone.");
      const expected = new Set(latest.after.map((cluster) => cluster.id));
      if (
        latest.after.some(
          (cluster) =>
            !review.clusters.some(
              (current) => JSON.stringify(current) === JSON.stringify(cluster),
            ),
        )
      )
        conflict("The group changed after this action.");
      // Undo restores grouping metadata only. It never revives a withdrawn report or approved assertion.
      review.clusters = review.clusters
        .filter((cluster) => !expected.has(cluster.id))
        .concat(structuredClone(latest.before));
      review.events.push({
        id: randomUUID(),
        pilotId: action.area,
        action: "undo",
        at: new Date().toISOString(),
        actorRole: "moderator",
        before: structuredClone(latest.after),
        after: structuredClone(latest.before),
        undoesEventId: latest.id,
        reason: action.reason,
      });
    },
  );
  return relationReviewView(state, actor, action.area);
}

/** Approved public notice pairs only. No private candidate, report, cluster, or owner identifiers. */
export function approvedOperationalRelations(state: State, pilotId: PilotId) {
  const review = readRelationReview(state);
  return review.candidates
    .filter(
      (candidate) =>
        candidate.pilotId === pilotId &&
        candidate.status === "approved" &&
        candidate.predicate === "SAME_OPERATIONAL_ISSUE_AS" &&
        validCandidate(state, candidate),
    )
    .flatMap((candidate) => {
      const notices = candidate.participants.map((p) => {
        const report = currentReport(state, p.reportId, pilotId);
        return state.notices.find(
          (notice) =>
            notice.id === report?.noticeId &&
            notice.status === "active" &&
            notice.pilotId === pilotId,
        );
      });
      if (notices.some((notice) => !notice)) return [];
      const [a, b] = notices as [
        NonNullable<(typeof notices)[number]>,
        NonNullable<(typeof notices)[number]>,
      ];
      const subjectId = `notice:${a.id}:revision:${a.revision}`,
        objectId = `notice:${b.id}:revision:${b.revision}`;
      return [
        {
          id: `operational:${hash([subjectId, objectId]).slice(0, 32)}`,
          subjectId,
          objectId,
          predicate: "SAME_OPERATIONAL_ISSUE_AS" as const,
          evidenceRefs: [subjectId, objectId],
          inferenceType: "human_review" as const,
          methodVersion: "fictional-relations/1" as const,
          reasonCodes: [
            "reviewed_same_fictional_asset_and_interval",
            "not_incident_confirmation",
            "independence_unknown",
          ],
          synthetic: true as const,
          qualification: {
            reviewedAt: candidate.reviewedAt,
            sourceFamilyIds: candidate.participants.map(
              (p) => p.sourceFamilyId,
            ),
            independence: "unknown" as const,
            validFrom: new Date(
              Math.max(
                ...candidate.participants.map((p) =>
                  Date.parse(p.observedFrom),
                ),
              ),
            ).toISOString(),
            validTo: new Date(
              Math.min(
                ...candidate.participants.map((p) => Date.parse(p.observedTo)),
              ),
            ).toISOString(),
          },
        },
      ];
    });
}
