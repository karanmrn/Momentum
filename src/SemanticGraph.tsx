import { useEffect, useState } from "react";
import type { PilotId } from "../packages/contracts";
import {
  semanticGraphSchema,
  type SemanticGraph as GraphData,
} from "../packages/semantic-graph/schema";
import "./SemanticGraph.css";

const predicateLabels: Record<string, string> = {
  WITHIN_AREA: "Within research area",
  AFFECTS_PLACE: "Concerns approximate place",
  ISSUED_BY: "Source",
  CONTEXTUAL_HISTORY_FOR: "Historical source coverage",
};

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
