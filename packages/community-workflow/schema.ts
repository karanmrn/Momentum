import { z } from "zod";
import {
  categorySchema,
  personaSchema,
  pilotSchema,
} from "../contracts/index.js";
const text = z.string().trim().min(5).max(600);
const timestamp = z.string().datetime({ offset: true });
const revision = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER - 1);
export const intakeSchema = z
  .object({
    pilotId: pilotSchema,
    category: categorySchema,
    title: z.string().trim().min(5).max(100),
    place: z.string().trim().min(3).max(100),
    observedFrom: timestamp,
    observedTo: timestamp,
    timePrecision: z.enum(["approximate_time", "time_window", "day"]),
    basis: z.enum(["firsthand", "other_source"]),
    sourceDescription: z.string().trim().max(300).optional().default(""),
    narrative: z.string().trim().max(600).optional().default(""),
    publication: z.enum(["private_only", "reviewed_public"]),
    synthetic: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    const interval =
      Date.parse(value.observedTo) - Date.parse(value.observedFrom);
    if (interval < 0 || interval > 31 * 86400000)
      context.addIssue({
        code: "custom",
        message: "Choose an ordered observation interval of at most 31 days.",
      });
    if (value.basis === "other_source" && value.sourceDescription.length < 5)
      context.addIssue({
        code: "custom",
        path: ["sourceDescription"],
        message: "Describe the other source without names or contact details.",
      });
  });
export type Intake = z.infer<typeof intakeSchema>;
export const ownerActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("respond"),
      expectedRevision: revision,
      message: text,
    })
    .strict(),
  z
    .object({
      action: z.literal("appeal"),
      expectedRevision: revision,
      message: text,
    })
    .strict(),
  z
    .object({
      action: z.literal("correct"),
      expectedRevision: revision,
      changes: intakeSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("withdraw"), expectedRevision: revision })
    .strict(),
]);
export type OwnerAction = z.infer<typeof ownerActionSchema>;
export const reviewActionSchema = z
  .object({
    expectedRevision: revision,
    action: z.enum([
      "start_review",
      "clarify",
      "approve",
      "review_private",
      "reject",
      "resolve",
      "retract",
    ]),
    reason: text,
    publicSummary: z.string().trim().max(600).optional().default(""),
  })
  .strict();
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export const discussionInputSchema = z
  .object({ expectedRevision: revision, text })
  .strict();
export const discussionReviewSchema = z
  .object({
    expectedRevision: revision,
    action: z.enum(["approve", "reject"]),
    reason: text,
    publicSummary: z.string().trim().max(600).optional().default(""),
  })
  .strict();
export const workflowStatusSchema = z.enum([
  "submitted",
  "in_review",
  "needs_clarification",
  "private_reviewed",
  "published",
  "rejected",
  "appealed",
  "correction_pending",
  "withdrawn",
  "resolved",
  "retracted",
]);
export const workflowRecordSchema = z
  .object({
    id: z.string().uuid(),
    reportId: z.string().uuid(),
    previousReportIds: z.array(z.string().uuid()).max(20),
    revision,
    status: workflowStatusSchema,
    intake: intakeSchema,
    createdAt: timestamp,
    history: z
      .array(
        z
          .object({
            revision,
            at: timestamp,
            actor: z.enum(["member", "moderator"]),
            action: z.string().max(60),
            message: z.string().max(600),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type WorkflowRecord = z.infer<typeof workflowRecordSchema>;
export const discussionSchema = z
  .object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    owner: personaSchema,
    revision,
    status: z.enum(["submitted", "approved", "rejected", "withdrawn"]),
    text: z.string().max(600),
    publicSummary: z.string().max(600),
    reviewReason: z.string().max(600),
    createdAt: timestamp,
  })
  .strict();
export type Discussion = z.infer<typeof discussionSchema>;
export interface CommunityWorkflowState {
  records: WorkflowRecord[];
  discussions: Discussion[];
  idempotency: Array<{
    key: string;
    digest: string;
    kind: "workflow" | "discussion";
    id: string;
  }>;
}
export interface WorkflowActor {
  persona: z.infer<typeof personaSchema>;
  moderatorAreas: z.infer<typeof pilotSchema>[];
}
