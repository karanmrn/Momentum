import outcomeData from "../../research/enrichment/police-outcomes.json" with { type: "json" };
import onsData from "../../research/enrichment/ons-geography.json" with { type: "json" };
import mpsData from "../../research/enrichment/mps-context.json" with { type: "json" };
import { policeOutcomeCollectionSchema } from "../enrichment/police-outcomes.js";
import { onsGeographySchema } from "../enrichment/ons-geography.js";
import { mpsContextSchema } from "../enrichment/mps-context.js";
import type { PilotId } from "../contracts/index.js";
import type { SemanticGraph } from "./schema.js";

type Node = SemanticGraph["nodes"][number];
type Edge = SemanticGraph["assertions"][number];
type Group = Pick<SemanticGraph, "nodes" | "assertions">;
const outcomes = policeOutcomeCollectionSchema.parse(outcomeData);
const ons = onsGeographySchema.parse(onsData);
const mps = mpsContextSchema.parse(mpsData);
const boroughs = {
  camden_town: "Camden",
  hounslow_town_centre: "Hounslow",
  west_croydon: "Croydon",
} as const;

/** Fixed public research slices. These do not establish pilot counts or current conditions. */
export function enrichmentGraph(pilotId: PilotId): Group[] {
  const groups: Group[] = [];
  function append(
    node: Node,
    predicate: "OUTCOME_FOR" | "CONTEXTUAL_AREA_ONLY",
    target: string,
    reasons: string[],
  ) {
    const provenance = node.provenance!;
    const snapshotId = `enrichment-snapshot:${provenance.snapshotSha256}`;
    const snapshot: Node = {
      id: snapshotId,
      type: "EnrichmentSnapshot",
      label: `${provenance.sourceFamilyId} source snapshot`,
      synthetic: false,
      provenance,
      metadata: {
        precision: "immutable_source_snapshot",
        alertEligible: false,
      },
    };
    function edge(
      predicate: Edge["predicate"],
      target: string,
      reasons: string[],
    ): Edge {
      return {
        id: `${node.id}:${predicate}:${target}`,
        subjectId: node.id,
        predicate,
        objectId: target,
        inferenceType: "deterministic_join",
        reasonCodes: reasons,
        evidenceRefs: [node.id, snapshotId],
        sourceQualification: {
          sourceFamilyId: provenance.sourceFamilyId,
          snapshotSha256: provenance.snapshotSha256 ?? null,
          recordedAt: provenance.fetchedAt,
          observedPeriod: node.metadata.period ?? null,
          precision: node.metadata.precision!,
          visibility: "public_context",
          lifecycle: "dated_source_snapshot",
          independence: "unknown",
          alertEligible: false,
        },
        methodVersion: "enrichment-projection/1",
        synthetic: false,
      };
    }
    groups.push({
      nodes: [snapshot, node],
      assertions: [
        edge("EXTRACTED_FROM", snapshotId, [
          "immutable_snapshot_and_source_record",
        ]),
        edge(predicate, target, reasons),
      ],
    });
  }
  const cells = mps.cells.filter((cell) => cell.borough === boroughs[pilotId]);
  const latestMonth = cells
    .map((cell) => cell.month)
    .sort()
    .at(-1);
  for (const cell of cells.filter((cell) => cell.month === latestMonth)) {
    append(
      {
        id: `aggregate:mps:${cell.id}`,
        type: "HistoricalAggregate",
        label: `${cell.borough}: ${cell.minorCategory}, ${cell.month}`,
        synthetic: false,
        provenance: {
          sourceId: "mps-borough",
          sourceFamilyId: mps.source.sourceFamilyId,
          sourceUrl: mps.source.url,
          fetchedAt: mps.source.fetchedAt,
          originGroupId: null,
          snapshotSha256: cell.sourceSnapshotSha256,
        },
        metadata: {
          value: cell.count,
          period: cell.month,
          sourceRowIndex: cell.sourceRowIndex,
          sourceColumn: cell.sourceColumn,
          precision: "borough_and_month_not_pilot_total",
          alertEligible: false,
          summary:
            "Latest acquired month only. Borough counts cannot confirm community reports or measure personal danger.",
        },
      },
      "CONTEXTUAL_AREA_ONLY",
      `area:${pilotId}`,
      [
        "whole_borough_not_pilot_total",
        "latest_acquired_month_not_live",
        "not_independent_of_police_uk",
      ],
    );
  }
  for (const row of ons.observations.filter((row) => row.pilotId === pilotId)) {
    if (
      row.status !== "verified_containment" ||
      !row.containingArea ||
      row.population.status !== "available" ||
      !row.population.evidence
    )
      continue;
    const evidence = row.population.evidence;
    append(
      {
        id: `aggregate:ons:${row.containingArea.code}:2021`,
        type: "HistoricalAggregate",
        label: `${row.containingArea.name}: Census 2021 residents`,
        synthetic: false,
        provenance: {
          sourceId: "ons-census-2021",
          sourceFamilyId: "ons-census-2021",
          sourceUrl: evidence.url,
          fetchedAt: evidence.retrievedAt,
          originGroupId: null,
          snapshotSha256: evidence.sha256,
        },
        metadata: {
          boundaryEvidence: row.boundaryEvidence.map((evidence) => ({
            sourceId: "ons-2021-boundaries",
            sourceFamilyId: "ons-geography",
            sourceUrl: evidence.url,
            fetchedAt: evidence.retrievedAt,
            originGroupId: null,
            snapshotSha256: evidence.sha256,
          })),
          value: row.population.usualResidents,
          period: row.population.period,
          sourceRecordKey: row.containingArea.code,
          precision: "whole_statistical_area_anchor_containment_only",
          alertEligible: false,
          summary:
            "Whole statistical area, not pilot population or visitor exposure. Overlapping LSOA and MSOA counts must not be added.",
        },
      },
      "CONTEXTUAL_AREA_ONLY",
      `area:${pilotId}`,
      ["research_anchor_containment_only", "not_crime_rate_denominator"],
    );
  }
  if (pilotId === "camden_town")
    for (const result of outcomes.results) {
      if (result.status !== "available") continue;
      for (const row of result.outcomes)
        append(
          {
            id: `outcome:${row.id}`,
            type: "PoliceOutcome",
            label: row.categoryName ?? "Outcome category unknown",
            synthetic: false,
            provenance: {
              sourceId: "police-outcomes",
              sourceFamilyId: "police-uk",
              sourceUrl: result.sourceUrl,
              fetchedAt: result.fetchedAt,
              originGroupId: null,
              snapshotSha256: row.sourceSnapshotSha256,
            },
            metadata: {
              sourceRecordKey: result.expectedCrime.persistentId,
              sourceRowIndex: row.sourceIndex,
              ...(row.month ? { period: row.month } : {}),
              precision: row.timePrecision,
              alertEligible: false,
              summary:
                "Dated source outcome. No person identity, exact transition date, or live investigation status is inferred.",
            },
          },
          "OUTCOME_FOR",
          `police:${result.expectedCrime.persistentId}`,
          [
            "exact_persistent_id_category_and_month",
            "not_community_incident_confirmation",
          ],
        );
    }
  return groups;
}

/** Imported numbers, lineage and meanings cannot be changed by a graph export caller. */
export function enrichmentProjectionError(graph: SemanticGraph): boolean {
  const groups = enrichmentGraph(graph.pilotId);
  const nodes = new Map(
    groups.flatMap((group) => group.nodes).map((node) => [node.id, node]),
  );
  const edges = new Map(
    groups.flatMap((group) => group.assertions).map((edge) => [edge.id, edge]),
  );
  const types = new Set([
    "HistoricalAggregate",
    "PoliceOutcome",
    "EnrichmentSnapshot",
  ]);
  const protectedIds = new Set(
    graph.nodes.filter((node) => types.has(node.type)).map((node) => node.id),
  );
  return (
    graph.nodes.some(
      (node) =>
        (types.has(node.type) || nodes.has(node.id)) &&
        canonical(node) !== canonical(nodes.get(node.id)),
    ) ||
    graph.assertions.some(
      (edge) =>
        (protectedIds.has(edge.subjectId) ||
          edges.has(edge.id) ||
          edge.methodVersion === "enrichment-projection/1") &&
        canonical(edge) !== canonical(edges.get(edge.id)),
    )
  );
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
      );
    return item;
  });
}
