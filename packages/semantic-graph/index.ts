import { z } from "zod";
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
  const police = records
    .filter(
      (row) =>
        row.pilotId === pilotId && row.sourceKind === "historical_police",
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const contextualIds: string[] = [];
  if (!police.length)
    graph.limitations.push(
      "Police source coverage is unavailable. Missing data does not mean no incidents.",
    );
  for (const row of police) {
    const id = `coverage:${pilotId}:${row.id}`,
      sourceId = `source:police-uk:${row.id}`;
    const available =
      (row.status === "acquired" || row.status === "partial") &&
      row.acquiredMonths.length > 0 &&
      row.fetchedAt !== null;
    const provenance = {
      sourceId: row.id,
      sourceFamilyId: "police-uk",
      sourceUrl: row.sourceUrl || null,
      fetchedAt: row.fetchedAt,
      originGroupId: null,
    };
    const inserted = add(
      [
        {
          id: sourceId,
          type: "Source",
          label: "Police.uk monthly records",
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
            status: available ? row.status : "blocked",
            months: available ? [...row.acquiredMonths].sort() : [],
            fetchedAt: available ? row.fetchedAt : null,
            geographyDescription: row.geographyDescription,
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
    if (inserted && available) contextualIds.push(id);
    if (!available)
      graph.limitations.push(
        "Police source coverage is unavailable. Missing data does not mean no incidents.",
      );
    graph.limitations.push(...row.limitations);
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
              observedAt: notice.observedAt,
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
  graph.limitations = [...new Set(graph.limitations)].slice(0, 100);
  return semanticGraphSchema.parse(graph);
}
