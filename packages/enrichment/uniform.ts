import { z } from "zod";
import { pilotSchema } from "../contracts/index.js";

const id = z.string().min(1).max(250);
const timestamp = z.string().datetime({ offset: true });
export const publicSourceUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use a public HTTPS source URL.");
export const observationTimeSchema = z
  .discriminatedUnion("precision", [
    z.object({ precision: z.literal("unknown") }).strict(),
    z
      .object({
        precision: z.literal("month"),
        month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
      })
      .strict(),
    z.object({ precision: z.literal("day"), date: z.string().date() }).strict(),
    z
      .object({
        precision: z.literal("interval"),
        start: timestamp,
        end: timestamp,
        uncertaintyMinutes: z.number().int().min(0).max(10080),
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (
      value.precision === "interval" &&
      Date.parse(value.start) > Date.parse(value.end)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The start must precede the end.",
      });
    }
  });

/** Metadata is shared across adapters. Source-specific content stays in its validated source record. */
export const enrichmentEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id,
    recordKind: z.enum([
      "police_record",
      "police_outcome",
      "area_population",
      "borough_crime_context",
      "dataset_coverage",
      "help_listing",
      "community_observation",
    ]),
    pilotId: pilotSchema,
    sourceFamilyId: id,
    originGroupId: id.nullable(),
    sourceRecordId: id,
    sourceUrl: publicSourceUrl.nullable(),
    snapshotSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    sourceRowIndex: z.number().int().nonnegative().nullable(),
    retrievedAt: timestamp.nullable(),
    sourcePublishedAt: timestamp.nullable(),
    observedTime: observationTimeSchema,
    geography: z
      .object({
        placeId: id,
        precision: z.enum([
          "anonymised_point",
          "statistical_area",
          "borough",
          "research_area",
          "listed_place",
          "community_named_area",
        ]),
        code: id.nullable(),
        vintage: z.number().int().min(1990).max(2100).nullable(),
        relation: z.enum([
          "source_location",
          "anchor_contained",
          "area_context_only",
          "listed_location",
          "reported_location",
        ]),
      })
      .strict(),
    accountBasis: z.enum([
      "official_record",
      "firsthand",
      "witness",
      "relayed",
      "unknown",
    ]),
    reviewStatus: z.enum([
      "source_published",
      "unreviewed",
      "reviewed",
      "withdrawn",
    ]),
    revision: z.number().int().positive(),
    supersedesId: id.nullable(),
    synthetic: z.boolean(),
    visibility: z.enum(["public_context", "private", "fictional_demo"]),
    alertEligible: z.literal(false),
    limitations: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict()
  .superRefine((row, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (row.synthetic !== (row.visibility === "fictional_demo"))
      issue("Fictional records require the demo namespace.");
    if (
      row.recordKind === "community_observation" &&
      !row.synthetic &&
      row.visibility !== "private"
    )
      issue("Genuine observations remain private.");
    if (
      row.recordKind !== "community_observation" &&
      row.visibility === "public_context" &&
      (!row.sourceUrl || !row.retrievedAt)
    )
      issue("Public context requires source provenance.");
    if (
      row.geography.precision === "statistical_area" &&
      (!row.geography.code || !row.geography.vintage)
    )
      issue("Statistical areas require a code and vintage.");
    if (
      row.recordKind === "area_population" &&
      (row.geography.precision !== "statistical_area" ||
        row.observedTime.precision !== "day")
    )
      issue("Population context requires a dated statistical area.");
    if (
      row.recordKind === "borough_crime_context" &&
      (row.geography.precision !== "borough" ||
        row.geography.relation !== "area_context_only" ||
        row.observedTime.precision !== "month")
    )
      issue("Borough counts require monthly borough context.");
    if (
      row.recordKind === "police_record" &&
      (row.observedTime.precision !== "month" ||
        row.geography.precision !== "anonymised_point")
    )
      issue("Street records retain month and anonymised geography.");
    if (row.revision === 1 && row.supersedesId)
      issue("An initial revision cannot supersede a record.");
    if (
      row.revision > 1 &&
      row.supersedesId !== `${row.id}:v${row.revision - 1}`
    )
      issue(
        "A revision must reference the previous version of the same record.",
      );
  });
export type EnrichmentEnvelope = z.infer<typeof enrichmentEnvelopeSchema>;

export function validateEnrichmentCollection(
  input: unknown,
): EnrichmentEnvelope[] {
  const rows = z.array(enrichmentEnvelopeSchema).max(15000).parse(input);
  const keys = rows.map((row) => `${row.id}:v${row.revision}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate enrichment revision.");
  return rows;
}

export function currentEnrichmentRecords(input: unknown): EnrichmentEnvelope[] {
  const latest = new Map<string, EnrichmentEnvelope>();
  for (const row of validateEnrichmentCollection(input)) {
    const previous = latest.get(row.id);
    if (!previous || row.revision > previous.revision) latest.set(row.id, row);
  }
  return [...latest.values()].filter((row) => row.reviewStatus !== "withdrawn");
}

/** Source diversity and claim independence are separate. Unknown origin never counts as independent confirmation. */
export function sourceDiversity(rows: EnrichmentEnvelope[]) {
  const valid = currentEnrichmentRecords(rows).filter(
    (row) => !row.synthetic && row.visibility === "public_context",
  );
  return {
    sourceFamilies: new Set(valid.map((row) => row.sourceFamilyId)).size,
    knownOriginGroups: new Set(
      valid.flatMap((row) => (row.originGroupId ? [row.originGroupId] : [])),
    ).size,
    unknownOrigins: valid.filter((row) => row.originGroupId === null).length,
    independentlyConfirmed: false as const,
  };
}
