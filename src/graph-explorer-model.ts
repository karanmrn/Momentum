import type { SemanticGraph as GraphData } from "../packages/semantic-graph/schema";
import type { NetworkNode, NetworkEdge } from "./EvidenceNetwork";

const predicateLabels: Record<string, string> = {
  SAME_OPERATIONAL_ISSUE_AS: "Reviewed same operational issue",
  WITHIN_AREA: "Within research area",
  AFFECTS_PLACE: "Concerns approximate place",
  ISSUED_BY: "Source",
  CONTEXTUAL_HISTORY_FOR: "Historical source coverage",
  DERIVED_FROM: "Derived from source",
  CONTEXTUAL_AREA_ONLY: "Area context only",
  EXTRACTED_FROM: "Extracted from dated source",
  OUTCOME_FOR: "Published outcome for police record",
  AVAILABILITY_FOR: "Published availability context",
};

const readable = (value: string) => value.replaceAll("_", " ");
function nodeDetails(
  node: GraphData["nodes"][number],
  localResearch: boolean,
): Array<[string, string]> {
  const meta = node.metadata;
  const details: Array<[string, string]> = [
    ["Record type", node.type.replaceAll(/([a-z])([A-Z])/g, "$1 $2")],
    ["Record ID", node.id],
    [
      "Data basis",
      node.synthetic
        ? "Fictional demonstration"
        : localResearch
          ? "Local research source record"
          : "Public source record",
    ],
  ];
  if (meta.availability)
    details.push([
      "Current availability",
      `${meta.availability}. A listing does not confirm current assistance.`,
    ]);
  if (meta.schedule !== undefined)
    details.push(["Published schedule", meta.schedule ?? "Not supplied"]);
  if (meta.address) details.push(["Listed address", meta.address]);
  if (meta.summary) details.push(["Summary", meta.summary]);
  if (meta.value !== undefined)
    details.push([
      "Source value",
      meta.value === null ? "Not supplied" : String(meta.value),
    ]);
  if (meta.period) details.push(["Source period", meta.period]);
  if (meta.precision) details.push(["Precision", readable(meta.precision)]);
  if (meta.revision !== undefined)
    details.push(["Revision", String(meta.revision)]);
  if (meta.observedAt) details.push(["Observed time", meta.observedAt]);
  if (meta.observedTo)
    details.push(["Observation interval end", meta.observedTo]);
  if (meta.timePrecision)
    details.push(["Observation precision", readable(meta.timePrecision)]);
  if (meta.sourceKind)
    details.push(["Source basis", readable(meta.sourceKind)]);
  if (meta.reportedAt) details.push(["Reported time", meta.reportedAt]);
  if (meta.correctionNote) details.push(["Correction", meta.correctionNote]);
  if (meta.sourceRecordKey)
    details.push(["Source record key", meta.sourceRecordKey]);
  if (meta.status) details.push(["Coverage", readable(meta.status)]);
  if (meta.months?.length)
    details.push(["Source months", meta.months.join(", ")]);
  if (meta.acquiredUnits !== undefined)
    details.push([
      "Acquisition",
      meta.acquiredUnits === null
        ? "Not supplied"
        : `${meta.acquiredUnits} ${meta.unitLabel ?? "source units"}`,
    ]);
  if (meta.geographyDescription)
    details.push(["Geography", meta.geographyDescription]);
  if (meta.coordinates)
    details.push([
      "Source coordinates",
      `${meta.coordinates.join(", ")}. Source precision applies.`,
    ]);
  if (node.provenance) {
    details.push(
      ["Source family", node.provenance.sourceFamilyId],
      ["Source ID", node.provenance.sourceId],
      ["Source URL", node.provenance.sourceUrl ?? "Not supplied"],
      ["Original claim lineage", node.provenance.originGroupId ?? "Unknown"],
      ["Source retrieved", node.provenance.fetchedAt ?? "Unknown"],
    );
    if (node.provenance.snapshotSha256 !== undefined)
      details.push([
        "Snapshot SHA256",
        node.provenance.snapshotSha256 ?? "Not supplied",
      ]);
  }
  if (
    meta.fetchedAt !== undefined &&
    meta.fetchedAt !== node.provenance?.fetchedAt
  )
    details.push(["Record retrieved", meta.fetchedAt ?? "Unknown"]);
  return details;
}
function assertionDetails(
  edge: GraphData["assertions"][number],
  labels: Map<string, string>,
  localResearch: boolean,
): Array<[string, string]> {
  const details: Array<[string, string]> = [
    ["Relationship ID", edge.id],
    ["Predicate", edge.predicate],
    [
      "Data basis",
      edge.synthetic
        ? "Fictional demonstration"
        : localResearch
          ? "Local research source relationship"
          : "Public source relationship",
    ],
    ["Method", readable(edge.inferenceType)],
    ["Method version", edge.methodVersion],
    ["Reason codes", edge.reasonCodes.join(", ")],
    [
      "Evidence records",
      edge.evidenceRefs.map((id) => labels.get(id) ?? id).join("; "),
    ],
  ];
  if (edge.metadata) {
    const meta = edge.metadata;
    details.push(
      ["Source family", meta.sourceFamilyId],
      ["Original claim lineage", meta.originGroupId ?? "Unknown"],
      ["Revision", String(meta.revision)],
      ["Recorded time", meta.recordedAt],
      ["Valid from", meta.validFrom ?? "Unknown"],
      ["Valid to", meta.validTo ?? "Unknown"],
      ["Time precision", readable(meta.timePrecision)],
      ["Spatial precision", readable(meta.spatialPrecision)],
      ["Relationship status", readable(meta.relationStatus)],
      ["Source independence", meta.independence],
    );
  }
  if (edge.sourceQualification) {
    const q = edge.sourceQualification;
    details.push(
      ["Source precision", readable(q.precision)],
      ["Source period", q.observedPeriod ?? "Unknown"],
      ["Source independence", q.independence],
      ["Alert eligible", "No"],
    );
  }
  if (edge.qualification) {
    const q = edge.qualification;
    details.push(
      ["Review time", q.reviewedAt],
      ["Source families", q.sourceFamilyIds.join(", ")],
      ["Review source independence", q.independence],
      ["Reported overlap from", q.validFrom],
      ["Reported overlap to", q.validTo],
    );
  }
  return details;
}

export function buildExplorerNetwork(graph: GraphData): {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
} {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const localResearch =
    graph.nodes.some((node) => node.type === "DatasetRecord") ||
    graph.limitations.includes(
      "Local research only. Publication remains disabled.",
    );
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      synthetic: node.synthetic,
      sourceUrl: node.provenance?.sourceUrl,
      details: nodeDetails(node, localResearch),
    })),
    edges: graph.assertions.map((edge) => ({
      id: edge.id,
      from: edge.subjectId,
      to: edge.objectId,
      label: predicateLabels[edge.predicate] ?? readable(edge.predicate),
      synthetic: edge.synthetic,
      details: assertionDetails(edge, labels, localResearch),
    })),
  };
}

export interface GraphComparison {
  title: string;
  explanation: string;
  nodeIds: string[];
  edgeIds: string[];
  steps: Array<{ from: string; to: string; label: string }>;
  causation: string;
}

const causation =
  "Why did it happen? The recorded evidence does not establish a cause. Shared location, source, or timing cannot explain a crime.";

/** Compare only records already present in the validated, permission-filtered projection. */
export function compareGraphRecords(
  graph: GraphData,
  firstId: string,
  secondId: string,
): GraphComparison {
  const empty = (title: string, explanation: string): GraphComparison => ({
    title,
    explanation,
    nodeIds: [],
    edgeIds: [],
    steps: [],
    causation,
  });
  if (graph.nodes.length > 500 || graph.assertions.length > 1000) {
    return empty(
      "Comparison unavailable",
      "This graph exceeds the comparison limit of 500 nodes or 1,000 edges.",
    );
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodes.has(firstId) || !nodes.has(secondId)) {
    return empty(
      "Choose two records",
      "Both records must appear in this area graph.",
    );
  }
  if (firstId === secondId) {
    return empty(
      "Choose different records",
      "A record cannot establish a relationship with itself.",
    );
  }
  type Edge = GraphData["assertions"][number];
  type Hop = { edge: Edge; from: string; to: string };
  const adjacent = new Map<string, Hop[]>();
  for (const edge of graph.assertions) {
    if (!nodes.has(edge.subjectId) || !nodes.has(edge.objectId)) continue;
    if (edge.evidenceRefs.some((id) => !nodes.has(id))) continue;
    for (const [from, to] of [
      [edge.subjectId, edge.objectId],
      [edge.objectId, edge.subjectId],
    ]) {
      const hops = adjacent.get(from) ?? [];
      hops.push({ edge, from, to });
      adjacent.set(from, hops);
    }
  }
  const queue: Array<{ id: string; path: Hop[] }> = [{ id: firstId, path: [] }];
  const visited = new Set([firstId]);
  let found: Hop[] | undefined;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { id, path } = queue[cursor];
    if (path.length >= 4) continue;
    for (const hop of adjacent.get(id) ?? []) {
      if (visited.has(hop.to)) continue;
      const nextPath = [...path, hop];
      if (hop.to === secondId) {
        found = nextPath;
        break;
      }
      visited.add(hop.to);
      queue.push({ id: hop.to, path: nextPath });
    }
    if (found) break;
  }
  if (!found) {
    return empty(
      "No recorded connection",
      `No connection was found within four relationships in this graph.${graph.truncated ? " This projection omits some records." : ""} This does not prove that no relationship exists.`,
    );
  }
  const direct = found.length === 1;
  const operational =
    direct && found[0].edge.predicate === "SAME_OPERATIONAL_ISSUE_AS";
  const lineage =
    direct && ["DERIVED_FROM", "ISSUED_BY"].includes(found[0].edge.predicate);
  const fictional = found.some(
    (hop) =>
      hop.edge.synthetic ||
      nodes.get(hop.from)?.synthetic ||
      nodes.get(hop.to)?.synthetic,
  );
  const qualification = operational && found[0].edge.qualification;
  const explanation = operational
    ? qualification
      ? `A reviewer connected these fictional notices to the same operational issue. Review: ${qualification.reviewedAt}. Reported overlap: ${qualification.validFrom} to ${qualification.validTo}. Source independence remains unknown. This does not establish a relationship between crimes.`
      : "This operational relationship has no review qualification. Its meaning cannot be confirmed."
    : lineage
      ? "This relationship records source lineage. Sharing a source does not connect separate crime events or explain their causes."
      : "These records share graph context through places, areas, sources, or recorded relationships. This path does not establish that separate crimes are related. Approximate police locations cannot confirm a community claim.";
  return {
    title: operational
      ? "Reviewed operational relationship"
      : lineage
        ? "Recorded source relationship"
        : "Context connection only",
    explanation: `${explanation}${fictional ? " This path includes fictional demonstration data." : ""}`,
    nodeIds: [firstId, ...found.map((hop) => hop.to)],
    edgeIds: found.map((hop) => hop.edge.id),
    steps: found.map((hop) => ({
      from: hop.from,
      to: hop.to,
      label: `${predicateLabels[hop.edge.predicate] ?? readable(hop.edge.predicate)}${hop.from !== hop.edge.subjectId ? " (reverse direction)" : ""}`,
    })),
    causation,
  };
}
