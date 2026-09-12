import { z } from "zod";
import sourceData from "../../research/camden-evidence/police-records.json";
import reportingData from "../../research/camden-evidence/reporting-sources.json";

const text = z.string().min(1).max(2000);
const timestamp = z.string().datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const exampleId = z.enum(["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05"]);
const httpsUrl = z
  .string()
  .url()
  .refine(
    (value) =>
      value.startsWith("https://") &&
      !new URL(value).username &&
      !new URL(value).password,
  );
const contextBase = {
  id: text,
  title: text,
  sourceUrl: httpsUrl,
  sourceFamilyId: text,
  sourcePublishedAt: z.string().nullable(),
  retrievedAt: timestamp,
  summary: text,
  incidentMatchEstablished: z.literal(false),
  synthetic: z.literal(false),
};
const contextSchema = z.union([
  z
    .object({
      ...contextBase,
      timePrecision: z.literal("day"),
      snapshotSha256: hash,
      responseSummary: text,
      relationship: z.literal("same_source_priority_and_action"),
      completionVerified: z.literal(false),
      independentCommunityReport: z.literal(false),
    })
    .strict(),
  z
    .object({
      ...contextBase,
      timePrecision: z.literal("source_schedule"),
      validFrom: timestamp,
      validTo: timestamp,
      usualLocation: text,
      exceptionLocation: text,
      actualDeployment: z.literal("unconfirmed"),
    })
    .strict(),
]);
export const reportingSources = z
  .object({
    schemaVersion: z.literal("1.0"),
    checkedAt: timestamp,
    sources: z
      .array(
        z
          .object({
            id: text,
            title: text,
            url: httpsUrl,
            status: z.literal("read"),
            summary: text,
          })
          .strict(),
      )
      .max(12),
    areaContext: z.array(contextSchema).max(2),
  })
  .strict()
  .parse(reportingData);
const policeRow = z
  .object({
    category: z.literal("violent-crime"),
    location_type: z.literal("Force"),
    location: z
      .object({
        latitude: z
          .string()
          .refine(
            (v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 90,
          ),
        longitude: z
          .string()
          .refine(
            (v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180,
          ),
        street: z
          .object({ id: z.number().int().positive(), name: text })
          .strict(),
      })
      .strict(),
    context: z.literal(""),
    outcome_status: z
      .object({ category: text, date: month })
      .strict()
      .nullable(),
    persistent_id: hash,
    id: z.number().int().positive(),
    location_subtype: z.literal(""),
    month,
  })
  .strict();
export const policeSelectionSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    scope: z.literal("five_record_research_example"),
    pilotId: z.literal("camden_town"),
    sourceUrl: z.literal(
      "https://data.police.uk/api/crimes-street/all-crime?date=2026-07&lat=51.5392&lng=-0.1426",
    ),
    sourceSnapshotSha256: hash,
    sourceFetchedAt: timestamp,
    recheckedAt: timestamp,
    recheckedSnapshotSha256: hash,
    allSelectedRowsUnchanged: z.literal(true),
    selection: z
      .object({
        month: z.literal("2026-07"),
        category: z.literal("violent-crime"),
        sourceCircleMiles: z.literal(1),
        anchor: z
          .object({
            latitude: z.literal(51.5392),
            longitude: z.literal(-0.1426),
          })
          .strict(),
        method: text,
        approvedPilotBoundary: z.literal(false),
      })
      .strict(),
    records: z
      .array(
        z
          .object({
            exampleId,
            sourceRowIndex: z.number().int().nonnegative(),
            raw: policeRow,
          })
          .strict(),
      )
      .length(5),
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const key of ["exampleId", "sourceRowIndex"] as const) {
      if (new Set(data.records.map((row) => row[key])).size !== 5)
        ctx.addIssue({
          code: "custom",
          message: "Selected records must be distinct.",
        });
    }
    if (
      new Set(data.records.map((row) => row.raw.persistent_id)).size !== 5 ||
      data.records.some((row) => row.raw.month !== data.selection.month)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Source identity or reporting month is invalid.",
      });
    }
  });
export const policeSelection = policeSelectionSchema.parse(sourceData);
export type ExampleId = z.infer<typeof exampleId>;
export const scenarioSchema = z
  .object({
    id: z.string().regex(/^fictional:CAM-0[1-5]$/),
    synthetic: z.literal(true),
    matchesPoliceRecord: z.literal(false),
    title: text,
    observedAt: timestamp,
    reportedAt: timestamp,
    timeBasis: z.literal("fictional_self_report_unverified"),
    participantRoles: z.array(text).min(1).max(4),
    account: text,
    publicSummary: text,
    correction: text,
    correctedObservedAt: timestamp,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Date.parse(value.observedAt) > Date.parse(value.reportedAt) ||
      Date.parse(value.correctedObservedAt) > Date.parse(value.reportedAt)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Reporting time must follow observed time.",
      });
    }
  });
const definitions = [
  [
    "Unwanted touching allegation",
    "2026-07-04T22:15:00+01:00",
    "2026-07-05T09:20:00+01:00",
    ["Person reporting unwanted contact", "Other person"],
    "I say someone touched me without consent while I waited in a busy public area. I moved away.",
    "A fictional contributor reports unwanted contact in Camden Town.",
    "The contributor corrected the recalled time. The allegation remains unverified.",
  ],
  [
    "Pushing allegation",
    "2026-07-09T18:40:00+01:00",
    "2026-07-09T21:05:00+01:00",
    ["Person reporting being pushed", "Other person"],
    "I say someone pushed me during a disagreement. I did not describe sexual contact or a sexual motive.",
    "A fictional contributor reports being pushed in Camden Town. No sexual context was specified.",
    "The contributor corrected the recalled time. No offence classification has been established.",
  ],
  [
    "Following concern",
    "2026-07-15T23:05:00+01:00",
    "2026-07-16T10:10:00+01:00",
    ["Person reporting a concern", "Other pedestrian"],
    "I thought another pedestrian followed me through two turns. I entered a staffed venue. I do not know their intent.",
    "A fictional contributor reports feeling followed in Camden Town. Intent is unknown.",
    "The contributor corrected the recalled time. Following and intent remain unverified.",
  ],
  [
    "Witness account",
    "2026-07-21T20:10:00+01:00",
    "2026-07-21T21:35:00+01:00",
    ["Witness", "Two people in an argument"],
    "I heard an argument and saw one person stumble. I did not see whether anyone pushed them.",
    "A fictional witness reports an argument in Camden Town. Physical contact was not observed.",
    "The witness corrected the recalled time. The cause of the stumble remains unknown.",
  ],
  [
    "Lighting and access observation",
    "2026-07-27T22:30:00+01:00",
    "2026-07-28T08:15:00+01:00",
    ["Person reporting an access issue"],
    "I found a dim section of pavement and a blocked access path. I could not tell whether a streetlight had failed.",
    "A fictional contributor reports reduced light and an access obstruction in Camden Town. No assault is alleged.",
    "The contributor corrected the recalled time. A lamp failure has not been confirmed.",
  ],
] as const;
export const fictionalScenarios = definitions.map((item, index) =>
  scenarioSchema.parse({
    id: `fictional:CAM-0${index + 1}`,
    synthetic: true,
    matchesPoliceRecord: false,
    title: item[0],
    observedAt: item[1],
    reportedAt: item[2],
    participantRoles: item[3],
    account: item[4],
    publicSummary: item[5],
    correction: item[6],
    correctedObservedAt: new Date(
      Date.parse(item[1]) - 20 * 60_000,
    ).toISOString(),
    timeBasis: "fictional_self_report_unverified",
  }),
);
export type DemoRevision = "original" | "corrected" | "withdrawn";
const stateSchema = z.enum(["original", "corrected", "withdrawn"]);
const graphNodeSchema = z
  .object({
    id: text,
    type: z.enum([
      "SourceSnapshot",
      "PoliceRecord",
      "ResearchArea",
      "AreaContext",
      "FictionalObservation",
      "FictionalSummary",
    ]),
    label: text,
    synthetic: z.boolean(),
    revision: z.number().int().positive(),
    precision: z.enum([
      "month_and_anonymised_point",
      "source_snapshot",
      "broad_study_context",
      "self_reported_unverified",
      "redacted_area_summary",
      "day",
      "source_schedule",
    ]),
    observedAt: timestamp.optional(),
    reportedAt: timestamp.optional(),
    correctionNote: text.optional(),
    provenance: z
      .object({
        sourceUrl: httpsUrl,
        sourceFamilyId: text,
        fetchedAt: timestamp,
        snapshotSha256: hash.nullable(),
        originGroupId: z.null(),
      })
      .strict()
      .optional(),
  })
  .strict();
const assertionSchema = z
  .object({
    id: text,
    subjectId: text,
    objectId: text,
    predicate: z.enum(["DERIVED_FROM", "CONTEXTUAL_AREA_ONLY"]),
    inferenceType: z.enum(["source_statement", "deterministic_join"]),
    reasonCodes: z.array(text).min(1).max(4),
    evidenceRefs: z.array(text).min(1).max(3),
    sourceFamilyId: text,
    originGroupId: text.nullable(),
    methodVersion: z.literal("camden-case-study/1"),
    synthetic: z.boolean(),
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
  .strict();
export const caseGraphSchema = z
  .object({
    version: z.literal("1.0"),
    state: stateSchema,
    nodes: z.array(graphNodeSchema).max(7),
    assertions: z.array(assertionSchema).max(6),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    if (
      nodes.size !== graph.nodes.length ||
      new Set(graph.assertions.map((edge) => edge.id)).size !==
        graph.assertions.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Graph identifiers must be unique.",
      });
    for (const node of graph.nodes) {
      if (node.synthetic !== node.type.startsWith("Fictional"))
        ctx.addIssue({
          code: "custom",
          message: "Source classes must remain separate.",
        });
    }
    for (const edge of graph.assertions) {
      const from = nodes.get(edge.subjectId),
        to = nodes.get(edge.objectId);
      const valid =
        edge.predicate === "DERIVED_FROM"
          ? (from?.type === "PoliceRecord" && to?.type === "SourceSnapshot") ||
            (from?.type === "FictionalSummary" &&
              to?.type === "FictionalObservation")
          : ["PoliceRecord", "AreaContext", "FictionalObservation"].includes(
              from?.type ?? "",
            ) && to?.type === "ResearchArea";
      if (
        !valid ||
        edge.synthetic !== from?.synthetic ||
        edge.evidenceRefs.some((id) => !nodes.has(id)) ||
        !edge.evidenceRefs.some(
          (id) => id === edge.subjectId || id === edge.objectId,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Unsupported evidence relationship.",
        });
      if (
        edge.validFrom &&
        edge.validTo &&
        Date.parse(edge.validFrom) > Date.parse(edge.validTo)
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid assertion time interval.",
        });
    }
    if (
      graph.state === "withdrawn" &&
      graph.nodes.some((node) => node.synthetic)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Withdrawn fictional evidence must not remain in the projection.",
      });
  });
export type CaseGraph = z.infer<typeof caseGraphSchema>;
export function buildCaseGraph(
  id: ExampleId,
  inputState: DemoRevision = "original",
): CaseGraph {
  const state = stateSchema.parse(inputState);
  const record = policeSelection.records.find(
    (row) => row.exampleId === exampleId.parse(id),
  )!;
  const scenario = fictionalScenarios.find(
    (row) => row.id === `fictional:${id}`,
  )!;
  const revision = state === "original" ? 1 : 2;
  const sourceId = `snapshot:${policeSelection.sourceSnapshotSha256}`;
  const recordId = `police:${record.raw.persistent_id}`;
  const areaId = "research-area:camden-circle";
  const nodes: CaseGraph["nodes"] = [
    {
      id: sourceId,
      type: "SourceSnapshot",
      label: "Police.uk source snapshot",
      synthetic: false,
      revision: 1,
      precision: "source_snapshot",
      provenance: {
        sourceUrl: policeSelection.sourceUrl,
        sourceFamilyId: "police-uk",
        fetchedAt: policeSelection.sourceFetchedAt,
        snapshotSha256: policeSelection.sourceSnapshotSha256,
        originGroupId: null,
      },
    },
    {
      id: recordId,
      type: "PoliceRecord",
      label: `${id}: ${record.raw.location.street.name}`,
      synthetic: false,
      revision: 1,
      precision: "month_and_anonymised_point",
    },
    {
      id: areaId,
      type: "ResearchArea",
      label: "Camden study context, not an exact boundary",
      synthetic: false,
      revision: 1,
      precision: "broad_study_context",
    },
  ];
  const assertions: CaseGraph["assertions"] = [];
  function edge(
    subjectId: string,
    objectId: string,
    predicate: "DERIVED_FROM" | "CONTEXTUAL_AREA_ONLY",
    synthetic: boolean,
    reason: string,
    evidenceRefs: string[],
  ) {
    assertions.push({
      id: `${subjectId}:${predicate}:r${synthetic ? revision : 1}`,
      subjectId,
      objectId,
      predicate,
      inferenceType:
        predicate === "DERIVED_FROM" && !synthetic
          ? "source_statement"
          : "deterministic_join",
      reasonCodes: [reason],
      evidenceRefs,
      sourceFamilyId: synthetic ? "streetwise-fictional-exercise" : "police-uk",
      originGroupId: synthetic ? scenario.id : null,
      methodVersion: "camden-case-study/1",
      synthetic,
      revision: synthetic ? revision : 1,
      recordedAt: synthetic
        ? scenario.reportedAt
        : policeSelection.sourceFetchedAt,
      validFrom: synthetic
        ? state === "corrected"
          ? scenario.correctedObservedAt
          : scenario.observedAt
        : "2026-07-01T00:00:00+01:00",
      validTo: synthetic ? null : "2026-08-01T00:00:00+01:00",
      timePrecision: synthetic ? "self_reported_unverified" : "month",
      spatialPrecision: synthetic ? "broad_area_context" : "anonymised_point",
      relationStatus: "context_only_or_source_lineage",
      independence: "unknown",
    });
  }
  edge(recordId, sourceId, "DERIVED_FROM", false, "exact_snapshot_row", [
    sourceId,
  ]);
  edge(
    recordId,
    areaId,
    "CONTEXTUAL_AREA_ONLY",
    false,
    "source_circle_not_exact_scene",
    [recordId],
  );
  for (const context of reportingSources.areaContext) {
    const contextId = `context:${context.id}`;
    nodes.push({
      id: contextId,
      type: "AreaContext",
      label: context.title,
      synthetic: false,
      revision: 1,
      precision: context.timePrecision,
      provenance: {
        sourceUrl: context.sourceUrl,
        sourceFamilyId: context.sourceFamilyId,
        fetchedAt: context.retrievedAt,
        snapshotSha256:
          "snapshotSha256" in context ? context.snapshotSha256 : null,
        originGroupId: null,
      },
    });
    edge(
      contextId,
      areaId,
      "CONTEXTUAL_AREA_ONLY",
      false,
      "shared_area_different_period_no_incident_match",
      [contextId],
    );
    Object.assign(assertions[assertions.length - 1], {
      sourceFamilyId: context.sourceFamilyId,
      recordedAt: context.retrievedAt,
      validFrom:
        "validFrom" in context
          ? context.validFrom
          : `${context.sourcePublishedAt}T00:00:00+01:00`,
      validTo: "validTo" in context ? context.validTo : null,
      timePrecision: context.timePrecision,
      spatialPrecision: "broad_area_context",
    });
  }
  if (state !== "withdrawn") {
    nodes.push(
      {
        id: scenario.id,
        type: "FictionalObservation",
        label: scenario.title,
        synthetic: true,
        revision,
        precision: "self_reported_unverified",
        observedAt:
          state === "corrected"
            ? scenario.correctedObservedAt
            : scenario.observedAt,
        reportedAt: scenario.reportedAt,
        ...(state === "corrected"
          ? { correctionNote: scenario.correction }
          : {}),
      },
      {
        id: `${scenario.id}:summary`,
        type: "FictionalSummary",
        label: scenario.publicSummary,
        synthetic: true,
        revision,
        precision: "redacted_area_summary",
        ...(state === "corrected"
          ? { correctionNote: scenario.correction }
          : {}),
      },
    );
    edge(
      scenario.id,
      areaId,
      "CONTEXTUAL_AREA_ONLY",
      true,
      "display_context_only_not_within_source_circle_or_event_match",
      [scenario.id],
    );
    edge(
      `${scenario.id}:summary`,
      scenario.id,
      "DERIVED_FROM",
      true,
      state === "corrected"
        ? "corrected_fictional_revision"
        : "redacted_fictional_summary",
      [scenario.id],
    );
  }
  return caseGraphSchema.parse({ version: "1.0", state, nodes, assertions });
}
