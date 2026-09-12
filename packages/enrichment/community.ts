import { z } from "zod";
import { enrichmentEnvelopeSchema, observationTimeSchema } from "./uniform.js";

const evidenceSchema = z
  .object({
    kind: z.enum([
      "witness_account",
      "photo",
      "video",
      "audio",
      "document",
      "cctv_location",
    ]),
    offered: z.boolean(),
    obtained: z.boolean(),
    reviewed: z.boolean(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.reviewed && !row.obtained)
      ctx.addIssue({
        code: "custom",
        message: "Evidence must be obtained before review.",
      });
  });
export const communityEnrichmentSchema = z
  .object({
    metadata: enrichmentEnvelopeSchema,
    submittedAt: z.string().datetime({ offset: true }),
    accountBasis: z.enum(["firsthand", "witness", "relayed", "unknown"]),
    observedTime: observationTimeSchema,
    behaviour: z.enum([
      "unwanted_touching",
      "physical_contact",
      "following",
      "verbal_harassment",
      "lighting_problem",
      "access_problem",
      "unknown",
    ]),
    roles: z
      .array(
        z.enum([
          "person_affected",
          "witness",
          "companion",
          "staff",
          "other_person",
          "unknown",
        ]),
      )
      .min(1)
      .max(6),
    evidence: z.array(evidenceSchema).max(6),
    consent: z
      .object({ privateReview: z.boolean(), redactedSummary: z.boolean() })
      .strict(),
    legalClassification: z.literal("not_determined"),
    policeMatch: z.literal("not_established"),
  })
  .strict()
  .superRefine((row, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (!Number.isFinite(Date.parse(row.submittedAt))) return;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(row.submittedAt));
    const datePart = (type: string) =>
      parts.find((part) => part.type === type)!.value;
    const submittedDay = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
    if (row.metadata.recordKind !== "community_observation")
      issue("Community metadata requires an observation record.");
    if (
      row.accountBasis !== row.metadata.accountBasis ||
      JSON.stringify(row.observedTime) !==
        JSON.stringify(row.metadata.observedTime)
    )
      issue("Observation fields must match their metadata.");
    if (
      row.observedTime.precision === "interval" &&
      Date.parse(row.observedTime.end) > Date.parse(row.submittedAt)
    )
      issue("An observed account cannot end after submission.");
    if (
      row.observedTime.precision === "day" &&
      row.observedTime.date > submittedDay
    )
      issue("An observed day cannot follow submission.");
    if (
      row.observedTime.precision === "month" &&
      row.observedTime.month > submittedDay.slice(0, 7)
    )
      issue("An observed month cannot follow submission.");
    if (new Set(row.roles).size !== row.roles.length)
      issue("Participant roles must be unique.");
    if (new Set(row.evidence.map((e) => e.kind)).size !== row.evidence.length)
      issue("Evidence types must be unique.");
    if (row.consent.redactedSummary && !row.consent.privateReview)
      issue("Summary consent requires private review consent.");
    if (row.metadata.reviewStatus === "reviewed" && !row.consent.privateReview)
      issue("Review requires consent.");
  });
export type CommunityEnrichment = z.infer<typeof communityEnrichmentSchema>;

/** Demonstrates structured intake only. No data is sent, persisted, or attached to a police event. */
export function createFictionalObservation(): CommunityEnrichment {
  const observedTime = {
    precision: "interval" as const,
    start: "2026-09-10T21:10:00+01:00",
    end: "2026-09-10T21:20:00+01:00",
    uncertaintyMinutes: 5,
  };
  return communityEnrichmentSchema.parse({
    metadata: {
      schemaVersion: "1.0",
      id: "fictional:enrichment:camden",
      recordKind: "community_observation",
      pilotId: "camden_town",
      sourceFamilyId: "fictional_community",
      originGroupId: "fictional:enrichment:camden",
      sourceRecordId: "fictional:enrichment:camden",
      sourceUrl: null,
      snapshotSha256: null,
      sourceRowIndex: null,
      retrievedAt: null,
      sourcePublishedAt: null,
      observedTime,
      geography: {
        placeId: "area:camden_town",
        precision: "community_named_area",
        code: null,
        vintage: null,
        relation: "reported_location",
      },
      accountBasis: "witness",
      reviewStatus: "unreviewed",
      revision: 1,
      supersedesId: null,
      synthetic: true,
      visibility: "fictional_demo",
      alertEligible: false,
      limitations: [
        "Entirely fictional. No link to a real police event.",
        "Roles describe participants without identifying them.",
      ],
    },
    submittedAt: "2026-09-10T22:00:00+01:00",
    accountBasis: "witness",
    observedTime,
    behaviour: "physical_contact",
    roles: ["person_affected", "witness", "other_person"],
    evidence: [
      { kind: "video", offered: true, obtained: false, reviewed: false },
    ],
    consent: { privateReview: true, redactedSummary: false },
    legalClassification: "not_determined",
    policeMatch: "not_established",
  });
}

export function reviseFictionalObservation(
  current: CommunityEnrichment,
  nextTime: z.infer<typeof observationTimeSchema>,
): CommunityEnrichment {
  const row = communityEnrichmentSchema.parse(current);
  if (!row.metadata.synthetic || row.metadata.reviewStatus === "withdrawn")
    throw new Error("Only an active fictional account can be revised here.");
  return communityEnrichmentSchema.parse({
    ...row,
    observedTime: nextTime,
    metadata: {
      ...row.metadata,
      observedTime: nextTime,
      reviewStatus: "unreviewed",
      revision: row.metadata.revision + 1,
      supersedesId: `${row.metadata.id}:v${row.metadata.revision}`,
    },
  });
}

export function withdrawFictionalObservation(
  current: CommunityEnrichment,
): CommunityEnrichment {
  const row = communityEnrichmentSchema.parse(current);
  if (!row.metadata.synthetic)
    throw new Error("This control supports fictional accounts only.");
  return communityEnrichmentSchema.parse({
    ...row,
    consent: { privateReview: false, redactedSummary: false },
    metadata: {
      ...row.metadata,
      reviewStatus: "withdrawn",
      revision: row.metadata.revision + 1,
      supersedesId: `${row.metadata.id}:v${row.metadata.revision}`,
    },
  });
}

export function projectCommunityMetadata(input: CommunityEnrichment) {
  const row = communityEnrichmentSchema.parse(input);
  if (row.metadata.reviewStatus === "withdrawn" || !row.metadata.synthetic)
    return null;
  return {
    ...row.metadata,
    label: "Fictional community account",
    behaviour: row.behaviour,
    policeMatch: row.policeMatch,
  };
}
