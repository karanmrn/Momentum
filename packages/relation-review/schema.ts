import { z } from "zod";
import { pilotSchema, categorySchema } from "../contracts/index.js";
const id = z.string().uuid();
const time = z.string().datetime({ offset: true });
const short = z.string().trim().min(1).max(300);
const status = z.enum(["candidate", "approved", "rejected", "invalidated"]);
export const qualificationSchema = z
  .object({
    reportId: id,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceFamilyId: z.literal("streetwise-fictional-relations"),
    originGroupId: short.nullable(),
    spatialPrecision: z.literal("fictional_asset_reference"),
    assetId: z.string().regex(/^fictional-asset:[a-z_]+:[a-z0-9-]+$/),
    observedFrom: time,
    observedTo: time,
    timePrecision: z.literal("fictional_reported_interval"),
  })
  .strict();
export const participantSchema = z
  .object({
    reportId: id,
    reportRevision: z.number().int().positive(),
    sourceFamilyId: z.enum([
      "streetwise-fictional-relations",
      "streetwise-demo-community",
    ]),
    originGroupId: short.nullable(),
    spatialPrecision: z.enum([
      "approximate_place",
      "fictional_asset_reference",
    ]),
    assetId: short.nullable(),
    observedFrom: time,
    observedTo: time,
    timePrecision: z.enum(["reported_point", "fictional_reported_interval"]),
  })
  .strict();
export const candidateSchema = z
  .object({
    id: z.string().regex(/^candidate:[a-f0-9]{32}$/),
    pilotId: pilotSchema,
    participants: z.tuple([participantSchema, participantSchema]),
    category: categorySchema,
    status,
    predicate: z.enum(["POSSIBLE_DUPLICATE_OF", "SAME_OPERATIONAL_ISSUE_AS"]),
    reasonCodes: z.array(short).min(1).max(12),
    independence: z.enum(["shared_origin", "unknown"]),
    methodVersion: z.literal("fictional-relations/1"),
    createdAt: time,
    reviewedAt: time.nullable(),
    reviewerRole: z.literal("moderator").nullable(),
    decisionReason: short.nullable(),
    retiredAt: time.nullable(),
    synthetic: z.literal(true),
    visibility: z.literal("moderator_private"),
  })
  .strict();
export const clusterSchema = z
  .object({
    id,
    pilotId: pilotSchema,
    reportIds: z.array(id).min(2).max(12),
    revision: z.number().int().positive(),
  })
  .strict();
export const clusterEventSchema = z
  .object({
    id,
    pilotId: pilotSchema,
    action: z.enum(["merge", "split", "undo"]),
    at: time,
    actorRole: z.literal("moderator"),
    before: z.array(clusterSchema).max(20),
    after: z.array(clusterSchema).max(20),
    undoesEventId: id.nullable(),
    reason: short,
  })
  .strict();
export const relationDecisionSchema = z
  .object({
    id,
    candidateId: z.string().regex(/^candidate:[a-f0-9]{32}$/),
    pilotId: pilotSchema,
    fromStatus: status,
    toStatus: status,
    at: time,
    actorRole: z.literal("moderator"),
    reason: short,
  })
  .strict();
export const relationReviewStateSchema = z
  .object({
    version: z.literal("1.0"),
    revision: z.number().int().positive(),
    qualifications: z.array(qualificationSchema).max(30),
    candidates: z.array(candidateSchema).max(100),
    decisions: z.array(relationDecisionSchema).max(150),
    clusters: z.array(clusterSchema).max(30),
    events: z.array(clusterEventSchema).max(100),
    examplesLoaded: z.array(pilotSchema).max(3),
    commands: z
      .record(
        z.string(),
        z
          .object({
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            revision: z.number().int().positive(),
          })
          .strict(),
      )
      .refine((v) => Object.keys(v).length <= 150, "Command limit reached."),
  })
  .strict();
export type RelationReviewState = z.infer<typeof relationReviewStateSchema>;
export type RelationCandidate = z.infer<typeof candidateSchema>;
export type RelationParticipant = z.infer<typeof participantSchema>;
export type ReviewCluster = z.infer<typeof clusterSchema>;
export type ClusterEvent = z.infer<typeof clusterEventSchema>;
export const baseActionSchema = z
  .object({ area: pilotSchema, expectedRevision: z.number().int().positive() })
  .strict();
export const decisionActionSchema = baseActionSchema
  .extend({ action: z.enum(["approve", "reject", "retract"]), reason: short })
  .strict();
export const mergeActionSchema = baseActionSchema
  .extend({ reportIds: z.array(id).min(2).max(12), reason: short })
  .strict();
export const splitActionSchema = baseActionSchema
  .extend({
    partitions: z.array(z.array(id).min(1).max(12)).min(2).max(12),
    reason: short,
  })
  .strict();
export const undoActionSchema = baseActionSchema
  .extend({ reason: short })
  .strict();
export const candidateIdSchema = z.string().regex(/^candidate:[a-f0-9]{32}$/);
export const objectIdSchema = id;
export const commandKeySchema = z.string().trim().min(8).max(128);
export const relationReviewViewSchema = z
  .object({
    revision: z.number().int().positive(),
    area: pilotSchema,
    synthetic: z.literal(true),
    candidates: z.array(candidateSchema).max(100),
    decisions: z.array(relationDecisionSchema).max(150),
    clusters: z.array(clusterSchema).max(30),
    events: z.array(clusterEventSchema).max(100),
    reports: z
      .array(
        z
          .object({
            id,
            revision: z.number().int().positive(),
            title: z.string(),
            description: z.string(),
            place: z.string(),
            category: categorySchema,
            observedAt: time,
            status: z.enum([
              "submitted",
              "approved_for_summary",
              "rejected",
              "withdrawn",
            ]),
          })
          .strict(),
      )
      .max(100),
    examplesLoaded: z.boolean(),
    limitations: z.array(z.string()).max(10),
  })
  .strict();
