import { z } from "zod";
import { enrichmentProjectionError } from "./enrichment.js";
import { caseProjectionError } from "./case-validation.js";
import { pilotSchema } from "../contracts/index.js";

const nodeTypes = [
  "Area",
  "Place",
  "Source",
  "PublishedNotice",
  "DatasetCoverage",
  "DatasetRecord",
  "HelpLocation",
  "SourceSnapshot",
  "PoliceRecord",
  "ResearchArea",
  "AreaContext",
  "FictionalObservation",
  "FictionalSummary",
  "EnrichmentSnapshot",
  "HistoricalAggregate",
  "PoliceOutcome",
  "AvailabilityAssertion",
] as const;
const predicates = [
  "WITHIN_AREA",
  "AFFECTS_PLACE",
  "ISSUED_BY",
  "CONTEXTUAL_HISTORY_FOR",
  "DERIVED_FROM",
  "CONTEXTUAL_AREA_ONLY",
  "SAME_OPERATIONAL_ISSUE_AS",
  "EXTRACTED_FROM",
  "OUTCOME_FOR",
  "AVAILABILITY_FOR",
] as const;
type NodeType = (typeof nodeTypes)[number];
const allowedPairs: Record<
  (typeof predicates)[number],
  readonly (readonly [NodeType, NodeType])[]
> = {
  EXTRACTED_FROM: [
    ["HistoricalAggregate", "EnrichmentSnapshot"],
    ["PoliceOutcome", "EnrichmentSnapshot"],
  ],
  OUTCOME_FOR: [["PoliceOutcome", "PoliceRecord"]],
  AVAILABILITY_FOR: [
    ["AvailabilityAssertion", "HelpLocation"],
    ["AvailabilityAssertion", "Place"],
  ],
  WITHIN_AREA: [
    ["Place", "Area"],
    ["DatasetCoverage", "Area"],
  ],
  AFFECTS_PLACE: [["PublishedNotice", "Place"]],
  ISSUED_BY: [
    ["DatasetRecord", "Source"],
    ["PublishedNotice", "Source"],
    ["DatasetCoverage", "Source"],
    ["HelpLocation", "Source"],
    ["Place", "Source"],
  ],
  CONTEXTUAL_HISTORY_FOR: [["DatasetCoverage", "PublishedNotice"]],
  SAME_OPERATIONAL_ISSUE_AS: [["PublishedNotice", "PublishedNotice"]],
  DERIVED_FROM: [
    ["PoliceRecord", "SourceSnapshot"],
    ["FictionalSummary", "FictionalObservation"],
  ],
  CONTEXTUAL_AREA_ONLY: [
    ["DatasetRecord", "Area"],
    ["PoliceRecord", "ResearchArea"],
    ["HistoricalAggregate", "ResearchArea"],
    ["AreaContext", "ResearchArea"],
    ["FictionalObservation", "ResearchArea"],
    ["ResearchArea", "Area"],
    ["HelpLocation", "Area"],
    ["Place", "Area"],
    ["HistoricalAggregate", "Area"],
  ],
};
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
        value: z.number().int().nonnegative().nullable().optional(),
        sourceRowIndex: z.number().int().nonnegative().optional(),
        sourceColumn: text.optional(),
        period: text.optional(),
        alertEligible: z.literal(false).optional(),
        boundaryEvidence: z.array(provenanceSchema).min(1).max(5).optional(),
        summary: text.optional(),
        precision: text.optional(),
        sourceRecordKey: text.optional(),
        availability: z.enum(["unconfirmed", "unknown"]).optional(),
        schedule: text.nullable().optional(),
        address: text.optional(),
        coordinates: z
          .tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])
          .optional(),
        reportedAt: timestamp.optional(),
        correctionNote: z.string().min(1).max(2000).optional(),
        acquiredUnits: z.number().int().nonnegative().nullable().optional(),
        unitLabel: text.nullable().optional(),
        observedAt: timestamp.optional(),
        observedTo: timestamp.optional(),
        timePrecision: z
          .enum(["approximate_time", "time_window", "day"])
          .optional(),
        sourceKind: z
          .enum(["community_firsthand", "community_other_source"])
          .optional(),
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
    methodVersion: z.enum([
      "1.0",
      "camden-case-study/1",
      "fictional-relations/1",
      "enrichment-projection/1",
      "availability-projection/1",
    ]),
    sourceQualification: z
      .object({
        sourceFamilyId: text,
        snapshotSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        recordedAt: timestamp.nullable(),
        observedPeriod: text.nullable(),
        precision: text,
        visibility: z.literal("public_context"),
        lifecycle: z.literal("dated_source_snapshot"),
        independence: z.literal("unknown"),
        alertEligible: z.literal(false),
      })
      .strict()
      .optional(),
    qualification: z
      .object({
        reviewedAt: timestamp,
        sourceFamilyIds: z
          .array(
            z.enum([
              "streetwise-fictional-relations",
              "streetwise-demo-community",
            ]),
          )
          .length(2),
        independence: z.literal("unknown"),
        validFrom: timestamp,
        validTo: timestamp,
      })
      .strict()
      .optional(),
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
    if (enrichmentProjectionError(graph))
      ctx.addIssue({
        code: "custom",
        message:
          "Enrichment must preserve its validated source snapshot, value, and qualification.",
      });
    const caseError = caseProjectionError(graph);
    if (caseError) ctx.addIssue({ code: "custom", message: caseError });
    for (const node of graph.nodes) {
      if (
        node.type === "AvailabilityAssertion" &&
        (node.synthetic ||
          !node.provenance ||
          node.metadata.availability === undefined ||
          node.metadata.alertEligible !== false ||
          node.metadata.precision !==
            "dated_directory_not_live_operator_status")
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Availability requires a dated source and an unconfirmed status.",
        });
      if (node.type.startsWith("Fictional") && !node.synthetic)
        ctx.addIssue({
          code: "custom",
          message: "Fictional nodes must be labelled.",
        });
      if (
        [
          "PoliceRecord",
          "SourceSnapshot",
          "AreaContext",
          "DatasetRecord",
        ].includes(node.type) &&
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
        subject !== undefined &&
        object !== undefined &&
        allowedPairs[edge.predicate].some(
          ([from, to]) => subject.type === from && object.type === to,
        ) &&
        (edge.predicate !== "SAME_OPERATIONAL_ISSUE_AS" ||
          subject.id !== object.id);
      if (
        ["EXTRACTED_FROM", "OUTCOME_FOR"].includes(edge.predicate) &&
        (edge.methodVersion !== "enrichment-projection/1" || edge.synthetic)
      )
        ctx.addIssue({
          code: "custom",
          message: "Enrichment requires dated real source lineage.",
        });
      if (
        edge.predicate === "AVAILABILITY_FOR" &&
        (edge.methodVersion !== "availability-projection/1" ||
          edge.synthetic ||
          subject?.metadata.availability === undefined ||
          !subject.provenance ||
          subject.metadata.availability !== object?.metadata.availability ||
          subject.metadata.schedule !== (object?.metadata.schedule ?? null) ||
          subject.metadata.alertEligible !== false ||
          subject.provenance.sourceUrl !== object?.provenance?.sourceUrl ||
          subject.provenance.fetchedAt !== object?.provenance?.fetchedAt)
      )
        ctx.addIssue({
          code: "custom",
          message: "Availability must preserve its dated directory source.",
        });
      if (
        ["enrichment-projection/1", "availability-projection/1"].includes(
          edge.methodVersion,
        )
      ) {
        const source = subject?.provenance;
        const qualification = edge.sourceQualification;
        if (
          !source ||
          !qualification ||
          qualification.sourceFamilyId !== source.sourceFamilyId ||
          qualification.recordedAt !== source.fetchedAt ||
          qualification.snapshotSha256 !== (source.snapshotSha256 ?? null) ||
          qualification.precision !== subject?.metadata.precision ||
          qualification.observedPeriod !== (subject?.metadata.period ?? null)
        )
          ctx.addIssue({
            code: "custom",
            message: "Source qualification must match the dated record.",
          });
      } else if (edge.sourceQualification) {
        ctx.addIssue({
          code: "custom",
          message:
            "Source qualification requires its versioned projection method.",
        });
      }
      if (edge.predicate === "SAME_OPERATIONAL_ISSUE_AS") {
        if (
          !edge.synthetic ||
          !subject?.synthetic ||
          !object?.synthetic ||
          edge.methodVersion !== "fictional-relations/1" ||
          edge.inferenceType !== "human_review" ||
          !edge.qualification ||
          Date.parse(edge.qualification.validFrom) >
            Date.parse(edge.qualification.validTo) ||
          edge.evidenceRefs.length !== 2 ||
          !edge.evidenceRefs.includes(edge.subjectId) ||
          !edge.evidenceRefs.includes(edge.objectId)
        )
          ctx.addIssue({
            code: "custom",
            message:
              "Operational relations require current reviewed fictional notice qualifications.",
          });
      } else if (
        edge.qualification ||
        edge.methodVersion === "fictional-relations/1"
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Operational qualification requires its explicit predicate.",
        });
      }
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
