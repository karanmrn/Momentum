import { z } from "zod";
import fixtures from "./fixtures.json";
import {
  pilotSchema,
  reportInputSchema,
  decisionSchema,
  type DemoState,
  type Persona,
} from "../contracts/index.js";
import {
  createDemoState,
  submitReport,
  decideReport,
  reportsForOwner,
  publicEvidenceGraph,
  findPublicNotice,
  dispatchNotifications,
  withdrawReport,
} from "../domain/index.js";

const id = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const authorSchema = z
  .object({
    id,
    displayName: text(3, 60).regex(/^Demo /),
    pilotId: pilotSchema,
    synthetic: z.literal(true),
  })
  .strict();
const scenarioSchema = z
  .object({
    id,
    authorId: id,
    pilotId: pilotSchema,
    topic: z.enum([
      "sexual_violence",
      "sexual_harassment",
      "violence",
      "hate_incident",
      "environment",
    ]),
    publication: z.enum(["private_only", "reviewable"]),
    title: text(5, 100),
    description: text(5, 600),
    place: text(3, 100),
    observedAt: z.string().datetime({ offset: true }),
    approvedSummary: text(5, 600),
    correctionSummary: text(5, 600),
    synthetic: z.literal(true),
  })
  .strict();

export const scenarioPackSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    synthetic: z.literal(true),
    origin: z.literal("original_fiction"),
    authors: z.array(authorSchema).length(6),
    scenarios: z.array(scenarioSchema).length(15),
  })
  .strict()
  .superRefine((pack, context) => {
    const authors = new Map(pack.authors.map((author) => [author.id, author]));
    if (authors.size !== pack.authors.length)
      context.addIssue({
        code: "custom",
        message: "Author IDs must be unique.",
      });
    if (
      new Set(pack.scenarios.map((scenario) => scenario.id)).size !==
      pack.scenarios.length
    )
      context.addIssue({
        code: "custom",
        message: "Scenario IDs must be unique.",
      });
    for (const pilot of pilotSchema.options) {
      if (
        pack.authors.filter((author) => author.pilotId === pilot).length !== 2
      )
        context.addIssue({
          code: "custom",
          message: "Each pilot needs two fictional authors.",
        });
      if (
        pack.scenarios.filter((scenario) => scenario.pilotId === pilot)
          .length !== 5
      )
        context.addIssue({
          code: "custom",
          message: "Each pilot needs five fictional scenarios.",
        });
      if (
        new Set(
          pack.scenarios
            .filter((scenario) => scenario.pilotId === pilot)
            .map((scenario) => scenario.topic),
        ).size !== 5
      )
        context.addIssue({
          code: "custom",
          message: "Each pilot needs five distinct topics.",
        });
    }
    pack.scenarios.forEach((scenario, index) => {
      if (authors.get(scenario.authorId)?.pilotId !== scenario.pilotId)
        context.addIssue({
          code: "custom",
          path: ["scenarios", index, "authorId"],
          message: "The author must belong to the scenario pilot.",
        });
      if (
        scenario.topic === "sexual_violence" &&
        scenario.publication !== "private_only"
      )
        context.addIssue({
          code: "custom",
          path: ["scenarios", index, "publication"],
          message: "Sexual violence exercises must remain private.",
        });
    });
  });

export type ScenarioPack = z.infer<typeof scenarioPackSchema>;
export const scenarioPack: ScenarioPack = scenarioPackSchema.parse(fixtures);

export interface ShareReference {
  synthetic: true;
  noticeId: string;
}

export function createShareReference(
  state: DemoState,
  reportId: string,
): ShareReference {
  const report = state.reports.find((candidate) => candidate.id === reportId);
  if (!report?.noticeId || report.status !== "approved_for_summary")
    throw new Error("Only a reviewed active summary can be shared.");
  if (findPublicNotice(state, report.noticeId).status !== "active")
    throw new Error("Only a reviewed active summary can be shared.");
  return { synthetic: true, noticeId: report.noticeId };
}

export function resolveShareReference(
  state: DemoState,
  reference: ShareReference,
) {
  const parsed = z
    .object({ synthetic: z.literal(true), noticeId: z.string().uuid() })
    .strict()
    .parse(reference);
  const notice = findPublicNotice(state, parsed.noticeId);
  return {
    synthetic: true as const,
    noticeId: notice.id,
    revision: notice.revision,
    status: notice.status,
    summary: notice.summary,
    graph: publicEvidenceGraph(state, notice.id),
  };
}

export function runScenario(scenarioId: string) {
  const scenario = scenarioPack.scenarios.find(
    (candidate) => candidate.id === scenarioId,
  );
  if (!scenario) throw new Error("Unknown fictional scenario.");
  const actor: Persona =
    scenarioPack.authors.findIndex(
      (author) => author.id === scenario.authorId,
    ) %
      2 ===
    0
      ? "alex"
      : "sam";
  const other = actor === "alex" ? "sam" : "alex";
  const state = createDemoState();
  state.reports = [];
  state.notices = [];
  state.notifications = [];
  state.idempotency = {};
  const category =
    scenario.topic === "environment" ? "infrastructure" : "community";
  state.preferences[actor] = {
    revision: 1,
    areas: [scenario.pilotId],
    categories: [category],
    inAppEnabled: true,
  };
  const submitted = submitReport(
    state,
    actor,
    reportInputSchema.parse({
      pilotId: scenario.pilotId,
      category,
      title: scenario.title,
      description: scenario.description,
      place: scenario.place,
      observedAt: scenario.observedAt,
      synthetic: true,
    }),
  );
  const ownerPrivate = !reportsForOwner(state, other).some(
    (report) => report.id === submitted.id,
  );
  let shareDeniedBeforeReview = false;
  try {
    createShareReference(state, submitted.id);
  } catch {
    shareDeniedBeforeReview = true;
  }
  if (scenario.publication === "private_only") {
    const withdrawn = withdrawReport(
      state,
      actor,
      submitted.id,
      submitted.revision,
    );
    return {
      synthetic: true as const,
      scenarioId,
      publication: scenario.publication,
      ownerPrivate,
      shareDeniedBeforeReview,
      submittedStatus: submitted.status,
      finalReportStatus: withdrawn.status,
      reportRedacted: withdrawn.description === "[withdrawn]",
      shared: null,
      corrected: null,
      withdrawn: null,
      notificationKinds: [],
      state,
    };
  }
  const approved = decideReport(
    state,
    "moderator",
    submitted.id,
    decisionSchema.parse({
      expectedRevision: submitted.revision,
      action: "approve",
      summary: scenario.approvedSummary,
    }),
  );
  const reference = createShareReference(state, approved.id);
  const shared = resolveShareReference(state, reference);
  dispatchNotifications(state, actor);
  const correctedReport = decideReport(
    state,
    "moderator",
    approved.id,
    decisionSchema.parse({
      expectedRevision: approved.revision,
      action: "retract",
      summary: scenario.correctionSummary,
    }),
  );
  const corrected = resolveShareReference(state, reference);
  const notifications = dispatchNotifications(state, actor);
  const withdrawnReport = withdrawReport(
    state,
    actor,
    correctedReport.id,
    correctedReport.revision,
  );
  return {
    synthetic: true as const,
    scenarioId,
    publication: scenario.publication,
    ownerPrivate,
    shareDeniedBeforeReview,
    submittedStatus: submitted.status,
    finalReportStatus: withdrawnReport.status,
    reportRedacted: withdrawnReport.description === "[withdrawn]",
    reference,
    shared,
    corrected,
    withdrawn: resolveShareReference(state, reference),
    notificationKinds: notifications
      .filter((item) => item.state === "delivered")
      .map((item) => item.kind),
    state,
  };
}
