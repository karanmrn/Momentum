import { z } from "zod";
import { enrichmentGraph } from "./enrichment.js";
import { approvedOperationalRelations } from "../relation-review/index.js";
import { localContextGraph } from "./local-context.js";
import { buildCaseGraph } from "../camden-evidence/index.js";
import {
  camdenExampleIds,
  readCamdenStudy,
} from "../camden-evidence/session.js";
import { areas, pilotSchema, type DemoState } from "../contracts/index.js";
import {
  findPublicNotice,
  listPublicNotices,
  publicEvidenceGraph,
} from "../domain/index.js";
import { datasetCoverageSchema } from "../datasets/src/coverage.js";

import {
  semanticOntology,
  semanticGraphSchema,
  type SemanticGraph,
} from "./schema.js";
export {
  semanticOntology,
  semanticGraphSchema,
  type SemanticGraph,
} from "./schema.js";

const text = z.string().min(1).max(1000);
const timestamp = z.string().datetime({ offset: true });
const publicNoticeSchema = z.object({
  synthetic: z.literal(true),
  reviewStatus: z.literal("publication_approved"),
  status: z.literal("active"),
  evidence: z
    .array(
      z.object({
        sourceFamilyId: text,
        originGroupId: text,
        sourceUrl: z.null(),
        fetchedAt: timestamp.nullable(),
        synthetic: z.literal(true),
      }),
    )
    .min(1)
    .max(20),
});

type Node = SemanticGraph["nodes"][number];
type Assertion = SemanticGraph["assertions"][number];

/** Rebuild from current public projections on every request, including after withdrawal. */
export function projectSemanticGraph(
  state: DemoState | null,
  pilotInput: unknown,
  datasetsInput: unknown,
  noticeId?: string,
): SemanticGraph {
  const pilotId = pilotSchema.parse(pilotInput);
  const records = z.array(datasetCoverageSchema).max(60).parse(datasetsInput);
  if (
    new Set(records.map((row) => `${row.pilotId}:${row.id}`)).size !==
    records.length
  )
    throw new Error("Duplicate dataset coverage.");
  if (noticeId !== undefined && state)
    findPublicNotice(state, z.string().uuid().parse(noticeId));
  const area = areas.find((candidate) => candidate.id === pilotId)!;
  const areaId = `area:${pilotId}`;
  const graph: SemanticGraph = {
    ontologyVersion: "1.0",
    pilotId,
    nodes: [
      {
        id: areaId,
        type: "Area",
        label: area.name,
        synthetic: false,
        provenance: null,
        metadata: {},
      },
    ],
    assertions: [],
    truncated: false,
    limitations: [
      semanticOntology.contextualMeaning,
      "Police nodes describe downloaded monthly source files, not incident totals or live warnings.",
      "Research boundaries remain unreviewed. Source-circle records are not approved pilot totals.",
      "Community notices are fictional and publication-reviewed. Review does not prove an incident.",
      "Private reports, identities, preferences and follower counts are excluded.",
    ],
  };
  function add(nodes: Node[], assertions: Assertion[]): boolean {
    const fresh = nodes.filter(
      (node) => !graph.nodes.some((existing) => existing.id === node.id),
    );
    if (
      graph.nodes.length + fresh.length > 100 ||
      graph.assertions.length + assertions.length > 200
    ) {
      graph.truncated = true;
      return false;
    }
    graph.nodes.push(...fresh);
    graph.assertions.push(...assertions);
    return true;
  }
  function edge(
    subjectId: string,
    predicate: Assertion["predicate"],
    objectId: string,
    synthetic: boolean,
    reasonCodes: string[],
    evidenceRefs: string[],
    inferenceType: Assertion["inferenceType"] = "deterministic_join",
  ): Assertion {
    return {
      id: `${subjectId}:${predicate}:${objectId}`,
      subjectId,
      predicate,
      objectId,
      synthetic,
      reasonCodes,
      evidenceRefs,
      inferenceType,
      methodVersion: "1.0",
    };
  }
  const selectedDatasets = records
    .filter((row) => row.pilotId === pilotId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const contextualIds: string[] = [];
  if (!selectedDatasets.some((row) => row.sourceKind === "historical_police"))
    graph.limitations.push(
      "Police source coverage is unavailable. Missing data does not mean no incidents.",
    );
  for (const row of selectedDatasets) {
    const id = `coverage:${pilotId}:${row.id}`,
      sourceId = `source:dataset:${row.id}`;
    const isPolice = row.sourceKind === "historical_police";
    const sourceFamilyId =
      row.sourceKind === "historical_police" || row.id === "police-priorities"
        ? "police-uk"
        : row.id === "naptan-stops"
          ? "dft-naptan"
          : row.sourceKind === "transport"
            ? "tfl"
            : row.sourceKind === "official_statistics"
              ? "ons"
              : `dataset:${row.id}`;
    const available =
      (row.status === "acquired" || row.status === "partial") &&
      (isPolice
        ? row.acquiredMonths.length > 0
        : row.acquiredUnits !== null && row.acquiredUnits > 0) &&
      row.fetchedAt !== null;
    const provenance = {
      sourceId: row.id,
      sourceFamilyId,
      sourceUrl: row.sourceUrl || null,
      fetchedAt: row.fetchedAt,
      originGroupId: null,
    };
    const inserted = add(
      [
        {
          id: sourceId,
          type: "Source",
          label: isPolice ? "Police.uk monthly records" : `${row.title} source`,
          synthetic: false,
          provenance,
          metadata: {},
        },
        {
          id,
          type: "DatasetCoverage",
          label: row.title,
          synthetic: false,
          provenance,
          metadata: {
            status: available
              ? row.status
              : row.status === "not_collected"
                ? "not_collected"
                : "blocked",
            months: available ? [...row.acquiredMonths].sort() : [],
            fetchedAt: available ? row.fetchedAt : null,
            geographyDescription: row.geographyDescription,
            acquiredUnits: isPolice ? null : row.acquiredUnits,
            unitLabel: isPolice ? null : row.unitLabel,
          },
        },
      ],
      [
        edge(
          id,
          "WITHIN_AREA",
          areaId,
          false,
          ["research_area_scope_not_approved_boundary"],
          [id],
        ),
        edge(
          id,
          "ISSUED_BY",
          sourceId,
          false,
          ["source_acquisition_metadata"],
          [id, sourceId],
        ),
      ],
    );
    if (inserted && available && isPolice) contextualIds.push(id);
    if (!available && isPolice)
      graph.limitations.push(
        "Police source coverage is unavailable. Missing data does not mean no incidents.",
      );
    graph.limitations.push(...row.limitations);
  }
  if (noticeId === undefined) {
    const context = localContextGraph(pilotId);
    add(context.nodes, context.assertions);
  }
  if (pilotId === "camden_town" && noticeId === undefined) {
    const study = state
      ? readCamdenStudy(state as DemoState & { camdenStudy?: unknown })
      : null;
    for (const example of camdenExampleIds) {
      const studyGraph = buildCaseGraph(
        example,
        study?.examples[example] ?? "withdrawn",
      );
      const caseNodes: Node[] = studyGraph.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        synthetic: node.synthetic,
        provenance: node.provenance
          ? {
              sourceId: node.provenance.sourceFamilyId,
              sourceFamilyId: node.provenance.sourceFamilyId,
              sourceUrl: node.provenance.sourceUrl,
              fetchedAt: node.provenance.fetchedAt,
              originGroupId: node.provenance.originGroupId,
              snapshotSha256: node.provenance.snapshotSha256,
            }
          : null,
        metadata: {
          revision: node.revision,
          precision: node.precision,
          ...(node.observedAt ? { observedAt: node.observedAt } : {}),
          ...(node.reportedAt ? { reportedAt: node.reportedAt } : {}),
          ...(node.correctionNote
            ? { correctionNote: node.correctionNote }
            : {}),
        },
      }));
      const caseAssertions: Assertion[] = studyGraph.assertions
        .map((assertion) => {
          const {
            sourceFamilyId,
            originGroupId,
            revision,
            recordedAt,
            validFrom,
            validTo,
            timePrecision,
            spatialPrecision,
            relationStatus,
            independence,
            ...base
          } = assertion;
          return {
            ...base,
            metadata: {
              sourceFamilyId,
              originGroupId,
              revision,
              recordedAt,
              validFrom,
              validTo,
              timePrecision,
              spatialPrecision,
              relationStatus,
              independence,
            },
          };
        })
        .filter(
          (assertion) =>
            !graph.assertions.some((existing) => existing.id === assertion.id),
        );
      if (!add(caseNodes, caseAssertions)) break;
    }
    const studyArea = graph.nodes.find((node) => node.type === "ResearchArea");
    if (studyArea)
      add(
        [],
        [
          edge(
            studyArea.id,
            "CONTEXTUAL_AREA_ONLY",
            areaId,
            false,
            ["candidate_study_footprint_not_approved_boundary"],
            [studyArea.id],
          ),
        ],
      );
    graph.limitations.push(
      "The five Camden police rows are a selected research sample. Fictional accounts do not describe those incidents.",
    );
  }
  const notices = state
    ? listPublicNotices(state, pilotId)
        .filter((notice) => noticeId === undefined || notice.id === noticeId)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  for (const notice of notices) {
    const validated = publicNoticeSchema.parse(notice);
    const evidence = validated.evidence[0];
    const publicGraph = publicEvidenceGraph(state!, notice.id);
    const place = publicGraph.nodes.find((node) => node.type === "place");
    const source = publicGraph.nodes.find((node) => node.type === "source");
    if (!place || !source) continue;
    const id = `notice:${notice.id}:revision:${notice.revision}`,
      placeId = `place:${notice.id}:revision:${notice.revision}`;
    const provenance = {
      sourceId: source.id,
      sourceFamilyId: evidence.sourceFamilyId,
      sourceUrl: evidence.sourceUrl,
      fetchedAt: evidence.fetchedAt,
      originGroupId: evidence.originGroupId,
    };
    if (
      !add(
        [
          {
            id,
            type: "PublishedNotice",
            label: notice.title,
            synthetic: true,
            provenance,
            metadata: {
              revision: notice.revision,
              summary: notice.summary,
              observedAt: notice.observedInterval?.from ?? notice.observedAt,
              sourceKind: notice.sourceKind,
              ...(notice.observedInterval
                ? {
                    observedTo: notice.observedInterval.to,
                    timePrecision: notice.observedInterval.precision,
                  }
                : {}),
            },
          },
          {
            id: placeId,
            type: "Place",
            label: place.label,
            synthetic: true,
            provenance: null,
            metadata: {},
          },
          {
            id: source.id,
            type: "Source",
            label: source.label,
            synthetic: true,
            provenance: { ...provenance, originGroupId: null },
            metadata: {},
          },
        ],
        [
          edge(
            id,
            "AFFECTS_PLACE",
            placeId,
            true,
            ["reviewed_approximate_place"],
            [id],
            "human_review",
          ),
          edge(
            id,
            "ISSUED_BY",
            source.id,
            true,
            ["publication_review_not_incident_confirmation"],
            [id, source.id],
            "human_review",
          ),
          edge(
            placeId,
            "WITHIN_AREA",
            areaId,
            true,
            ["reviewed_approximate_place"],
            [id],
          ),
          ...contextualIds.map((coverageId) =>
            edge(
              coverageId,
              "CONTEXTUAL_HISTORY_FOR",
              id,
              true,
              [
                "shared_research_area",
                "police_month_only",
                "not_event_confirmation",
              ],
              [coverageId, id],
            ),
          ),
        ],
      )
    )
      break;
  }
  if (state) {
    const visible = new Set(graph.nodes.map((node) => node.id));
    for (const relation of approvedOperationalRelations(state, pilotId)) {
      if (
        visible.has(relation.subjectId) &&
        visible.has(relation.objectId) &&
        relation.qualification.reviewedAt
      ) {
        add(
          [],
          [
            {
              ...relation,
              qualification: {
                ...relation.qualification,
                reviewedAt: relation.qualification.reviewedAt,
              },
            },
          ],
        );
      }
    }
  }
  if (noticeId === undefined) {
    for (const group of enrichmentGraph(pilotId)) {
      const availableIds = new Set(
        [...graph.nodes, ...group.nodes].map((node) => node.id),
      );
      if (group.assertions.some((edge) => !availableIds.has(edge.objectId)))
        continue;
      if (!add(group.nodes, group.assertions)) break;
    }
    graph.limitations.push(
      "Enrichment shows the latest acquired MPS month and selected ONS areas. These are not pilot totals or independent police corroboration.",
    );
  }
  graph.limitations = [...new Set(graph.limitations)].slice(0, 100);
  return semanticGraphSchema.parse(graph);
}
