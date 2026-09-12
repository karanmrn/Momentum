import { z } from "zod";
import { pilotSchema } from "../contracts/index.js";

const nodeTypes = [
  "Area",
  "Place",
  "Source",
  "PublishedNotice",
  "DatasetCoverage",
] as const;
const predicates = [
  "WITHIN_AREA",
  "AFFECTS_PLACE",
  "ISSUED_BY",
  "CONTEXTUAL_HISTORY_FOR",
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
    inferenceType: z.enum(["deterministic_join", "human_review"]),
    reasonCodes: z.array(text).min(1).max(5),
    evidenceRefs: z.array(text).min(1).max(3),
    methodVersion: z.literal("1.0"),
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
              : subject?.type === "DatasetCoverage" &&
                object?.type === "PublishedNotice";
      if (!validPair || edge.evidenceRefs.some((id) => !nodes.has(id))) {
        ctx.addIssue({
          code: "custom",
          message: "The assertion has invalid node references or types.",
        });
      }
    }
  });
export type SemanticGraph = z.infer<typeof semanticGraphSchema>;
