import { useEffect, useState } from "react";
import type { PilotId } from "../packages/contracts";
import {
  semanticGraphSchema,
  type SemanticGraph as GraphData,
} from "../packages/semantic-graph/schema";
import "./SemanticGraph.css";
import { EvidenceNetwork } from "./EvidenceNetwork";

const predicateLabels: Record<string, string> = {
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
): Array<[string, string]> {
  const meta = node.metadata;
  const details: Array<[string, string]> = [
    ["Record type", node.type.replaceAll(/([a-z])([A-Z])/g, "$1 $2")],
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
): Array<[string, string]> {
  const details: Array<[string, string]> = [
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
  if (edge.qualification) {
    const q = edge.qualification;
    details.push(
      ["Review time", q.reviewedAt],
      ["Source families", q.sourceFamilyIds.join(", ")],
      ["Source independence", q.independence],
      ["Reported overlap from", q.validFrom],
      ["Reported overlap to", q.validTo],
    );
  }
  return details;
}

export function SemanticGraph({
  area,
  isPublic,
}: {
  area: PilotId;
  isPublic: boolean;
}) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setGraph(null);
    setError("");
    async function load() {
      try {
        const response = await fetch(
          `/api/${isPublic ? "public/" : ""}graph?area=${area}`,
          {
            signal: controller.signal,
            credentials: "same-origin",
          },
        );
        if (!response.ok) throw new Error("unavailable");
        const envelope = await response.json();
        if (envelope.schemaVersion !== "1.0")
          throw new Error("invalid response");
        const next = semanticGraphSchema.parse(envelope.data);
        if (next.pilotId !== area) throw new Error("wrong area");
        if (!controller.signal.aborted) setGraph(next);
      } catch {
        if (!controller.signal.aborted)
          setError("Evidence relations are unavailable. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [area, isPublic, attempt]);

  const labels = new Map(graph?.nodes.map((node) => [node.id, node.label]));
  return (
    <section className="panel semantic-panel" aria-label="Evidence graph">
      <div className="semantic-heading">
        <h2>Evidence graph</h2>
        <button
          className="button secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh graph
        </button>
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !graph ? (
        <p role="status">Loading evidence relations...</p>
      ) : (
        <>
          <p className="subtle">
            {isPublic
              ? "Public source coverage"
              : "Fictional community notices with public source coverage"}{" "}
            · Ontology {graph.ontologyVersion}
          </p>
          <EvidenceNetwork
            nodes={graph.nodes.map((node) => ({
              id: node.id,
              label: node.label,
              type: node.type,
              synthetic: node.synthetic,
              sourceUrl: node.provenance?.sourceUrl,
              sourceFamily: node.provenance?.sourceFamilyId,
              details: nodeDetails(node),
            }))}
            edges={graph.assertions.map((edge) => ({
              id: edge.id,
              from: edge.subjectId,
              to: edge.objectId,
              label: predicateLabels[edge.predicate] || edge.predicate,
              synthetic: edge.synthetic,
              details: assertionDetails(edge, labels),
            }))}
          />
          <a
            className="button secondary"
            href={`/api/${isPublic ? "public/" : ""}graph/export?area=${area}`}
            download
          >
            Download Graphify graph
          </a>
          <div className="semantic-table-wrap">
            <table className="semantic-table">
              <caption>Source relations and their meaning</caption>
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Relation</th>
                  <th scope="col">Related record</th>
                </tr>
              </thead>
              <tbody>
                {graph.assertions.map((assertion) => (
                  <tr key={assertion.id}>
                    <td>{labels.get(assertion.subjectId)}</td>
                    <td>
                      {predicateLabels[assertion.predicate] ||
                        assertion.predicate}
                      <small>
                        {assertion.inferenceType.replaceAll("_", " ")}
                      </small>
                    </td>
                    <td>{labels.get(assertion.objectId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!graph.assertions.length && (
            <p>No current relations are available.</p>
          )}
          <details>
            <summary>Sources and ontology</summary>
            <ul>
              {graph.nodes.map((node) => (
                <li key={node.id}>
                  <strong>{node.label}</strong> · {node.type}
                  {node.synthetic && " · Fictional"}
                  {node.metadata.status && (
                    <p>
                      Acquisition: {node.metadata.status.replaceAll("_", " ")}
                    </p>
                  )}
                  {node.metadata.months?.length ? (
                    <p>Source months: {node.metadata.months.join(", ")}</p>
                  ) : null}
                  {node.metadata.geographyDescription && (
                    <p>{node.metadata.geographyDescription}</p>
                  )}
                  {node.provenance && (
                    <p>
                      Source family: {node.provenance.sourceFamilyId}
                      {node.provenance.fetchedAt &&
                        ` · Retrieved ${new Date(node.provenance.fetchedAt).toLocaleDateString("en-GB")}`}
                      {node.provenance.sourceUrl?.startsWith("https://") && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={node.provenance.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open source
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p>
              Relations describe source lineage and shared areas. They do not
              confirm individual incidents.
            </p>
          </details>
          {graph.limitations.map((limit) => (
            <p className="subtle" key={limit}>
              {limit}
            </p>
          ))}
          {graph.truncated && (
            <p role="status">
              This view reached its display limit. Some public relations are
              omitted.
            </p>
          )}
        </>
      )}
    </section>
  );
}
