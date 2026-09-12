import { z } from "zod";
import { pilotSchema } from "../contracts/index.js";

const nodeTypes = [
  "Area",
  "Place",
  "Source",
  "PublishedNotice",
  "DatasetCoverage",
  "SourceSnapshot",
  "PoliceRecord",
  "ResearchArea",
  "AreaContext",
  "FictionalObservation",
  "FictionalSummary",
] as const;
const predicates = [
  "WITHIN_AREA",
  "AFFECTS_PLACE",
  "ISSUED_BY",
  "CONTEXTUAL_HISTORY_FOR",
  "DERIVED_FROM",
  "CONTEXTUAL_AREA_ONLY",
] as const;
export const semanticOntology = {
  version: "1.0",
  nodeTypes,
  predicates,
  contextualMeaning:
    "Shared research area only. Monthly police coverage cannot confirm a community report.",
  storage:
    "Read projection of existing records. No second authoritative store.",
} as const;
const text = z.string().min(1).max(1000);
const timestamp = z.string().datetime({ offset: true });
const provenanceSchema = z
  .object({
    sourceId: text,
    sourceFamilyId: text,
    sourceUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      }, "Source links must use HTTPS without credentials.")
      .nullable(),
    fetchedAt: timestamp.nullable(),
    originGroupId: text.nullable(),
    snapshotSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .optional(),
  })
  .strict();
const nodeSchema = z
  .object({
    id: text,
    type: z.enum(nodeTypes),
    label: text,
    synthetic: z.boolean(),
    provenance: provenanceSchema.nullable(),
    metadata: z
      .object({
        revision: z.number().int().positive().optional(),
        summary: text.optional(),
        precision: text.optional(),
        reportedAt: timestamp.optional(),
        correctionNote: z.string().min(1).max(2000).optional(),
        acquiredUnits: z.number().int().nonnegative().nullable().optional(),
        unitLabel: text.nullable().optional(),
        observedAt: timestamp.optional(),
        status: z
          .enum(["acquired", "partial", "blocked", "not_collected"])
          .optional(),
        months: z
          .array(z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/))
          .max(36)
          .optional(),
        geographyDescription: text.optional(),
        fetchedAt: timestamp.nullable().optional(),
      })
      .strict(),
  })
  .strict();
const assertionSchema = z
  .object({
    id: text,
    subjectId: text,
    predicate: z.enum(predicates),
    objectId: text,
    inferenceType: z.enum([
      "deterministic_join",
      "human_review",
      "source_statement",
    ]),
    reasonCodes: z.array(text).min(1).max(5),
    evidenceRefs: z.array(text).min(1).max(3),
    methodVersion: z.enum(["1.0", "camden-case-study/1"]),
    metadata: z
      .object({
        sourceFamilyId: text,
        originGroupId: text.nullable(),
        revision: z.number().int().positive(),
        recordedAt: timestamp,
        validFrom: timestamp.nullable(),
        validTo: timestamp.nullable(),
        timePrecision: z.enum([
          "month",
          "day",
          "source_schedule",
          "self_reported_unverified",
        ]),
        spatialPrecision: z.enum(["anonymised_point", "broad_area_context"]),
        relationStatus: z.literal("context_only_or_source_lineage"),
        independence: z.literal("unknown"),
      })
      .strict()
      .optional(),
    synthetic: z.boolean(),
  })
  .strict();
export const semanticGraphSchema = z
  .object({
    ontologyVersion: z.literal("1.0"),
    pilotId: pilotSchema,
    nodes: z.array(nodeSchema).max(100),
    assertions: z.array(assertionSchema).max(200),
    limitations: z.array(text).max(100),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    if (
      nodes.size !== graph.nodes.length ||
      new Set(graph.assertions.map((edge) => edge.id)).size !==
        graph.assertions.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Graph identifiers must be unique.",
      });
    }
    for (const node of graph.nodes) {
      if (node.type.startsWith("Fictional") && !node.synthetic)
        ctx.addIssue({
          code: "custom",
          message: "Fictional nodes must be labelled.",
        });
      if (
        ["PoliceRecord", "SourceSnapshot", "AreaContext"].includes(node.type) &&
        (node.synthetic || !node.provenance)
      )
        ctx.addIssue({
          code: "custom",
          message: "Source nodes require real provenance.",
        });
    }
    for (const edge of graph.assertions) {
      const subject = nodes.get(edge.subjectId),
        object = nodes.get(edge.objectId);
      const validPair =
        edge.predicate === "WITHIN_AREA"
          ? ["Place", "DatasetCoverage"].includes(subject?.type ?? "") &&
            object?.type === "Area"
          : edge.predicate === "AFFECTS_PLACE"
            ? subject?.type === "PublishedNotice" && object?.type === "Place"
            : edge.predicate === "ISSUED_BY"
              ? ["PublishedNotice", "DatasetCoverage"].includes(
                  subject?.type ?? "",
                ) && object?.type === "Source"
              : edge.predicate === "CONTEXTUAL_HISTORY_FOR"
                ? subject?.type === "DatasetCoverage" &&
                  object?.type === "PublishedNotice"
                : edge.predicate === "DERIVED_FROM"
                  ? (subject?.type === "PoliceRecord" &&
                      object?.type === "SourceSnapshot") ||
                    (subject?.type === "FictionalSummary" &&
                      object?.type === "FictionalObservation")
                  : ([
                      "PoliceRecord",
                      "AreaContext",
                      "FictionalObservation",
                    ].includes(subject?.type ?? "") &&
                      object?.type === "ResearchArea") ||
                    (subject?.type === "ResearchArea" &&
                      object?.type === "Area");
      if (edge.methodVersion === "camden-case-study/1") {
        const qualification = edge.metadata;
        const evidenceNode =
          edge.predicate === "DERIVED_FROM" ? object : subject;
        if (
          !qualification ||
          edge.synthetic !== subject?.synthetic ||
          (!edge.synthetic &&
            (qualification.sourceFamilyId !==
              evidenceNode?.provenance?.sourceFamilyId ||
              qualification.recordedAt !==
                evidenceNode?.provenance?.fetchedAt)) ||
          (edge.synthetic &&
            (qualification.sourceFamilyId !== "streetwise-fictional-exercise" ||
              qualification.revision !== subject?.metadata.revision)) ||
          (qualification.validFrom &&
            qualification.validTo &&
            Date.parse(qualification.validFrom) >
              Date.parse(qualification.validTo))
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Case assertions require matching source qualification.",
          });
        }
      }
      if (
        !validPair ||
        edge.evidenceRefs.some((id) => !nodes.has(id)) ||
        (!edge.synthetic &&
          ([subject, object].some((node) => node?.synthetic) ||
            edge.evidenceRefs.some((id) => nodes.get(id)?.synthetic)))
      ) {
        ctx.addIssue({
          code: "custom",
          message: "The assertion has invalid node references or types.",
        });
      }
    }
  });
export type SemanticGraph = z.infer<typeof semanticGraphSchema>;
