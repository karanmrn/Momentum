import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  GitBranch,
  Search,
  Download,
  RefreshCw,
} from "lucide-react";
import { areas, type PilotId } from "../packages/contracts";
import {
  semanticGraphSchema,
  type SemanticGraph,
} from "../packages/semantic-graph/schema";
import { toGraphifyGraph } from "../packages/semantic-graph/graphify";
import {
  GraphDatasetBrowser,
  type ResearchGraphState,
} from "./GraphDatasetBrowser";
import { GraphCanvas } from "./GraphCanvas";
import {
  buildExplorerNetwork,
  compareGraphRecords,
} from "./graph-explorer-model";
import "./GraphExplorer.css";

type Selection = { kind: "node" | "edge"; id: string } | null;
const shortType = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2");
export function GraphExplorer({
  initialArea,
  onExit,
}: {
  initialArea: PilotId;
  onExit: (area: PilotId) => void;
}) {
  const [area, setArea] = useState(initialArea);
  const [examples, setExamples] = useState(
    new URLSearchParams(location.search).get("examples") === "1",
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    graph: SemanticGraph;
  } | null>(null);
  const [baseError, setError] = useState("");
  const [research, setResearch] = useState<ResearchGraphState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [display, setDisplay] = useState<"graph" | "records">("graph");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [compare, setCompare] = useState(false);
  const key = `${area}:${examples}`;
  const researchActive = research?.area === area && research.active;
  const graph = researchActive
    ? research.graph
    : loaded?.key === key
      ? loaded.graph
      : null;
  const error = researchActive ? research.error : baseError;
  const network = useMemo(
    () => (graph ? buildExplorerNetwork(graph) : { nodes: [], edges: [] }),
    [graph],
  );
  const areaName = areas.find((a) => a.id === area)!.name;
  const comparison = useMemo(
    () =>
      compare && graph && first && second
        ? compareGraphRecords(graph, first, second)
        : null,
    [compare, graph, first, second],
  );
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setSelection(null);
    setFirst("");
    setSecond("");
    setCompare(false);
    setQuery("");
    setType("");
    async function load() {
      try {
        if (examples) {
          const session = await fetch("/api/session", {
            credentials: "same-origin",
            signal: controller.signal,
          });
          if (!session.ok) throw new Error("demo");
        }
        const response = await fetch(
          `/api/${examples ? "" : "public/"}graph?area=${area}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json();
        if (body.schemaVersion !== "1.0") throw new Error("schema");
        const next = semanticGraphSchema.parse(body.data);
        if (
          next.pilotId !== area ||
          (!examples &&
            (body.synthetic !== false ||
              next.nodes.some(
                (n) => n.synthetic || n.type === "DatasetRecord",
              ) ||
              next.assertions.some((e) => e.synthetic)))
        )
          throw new Error("scope");
        if (!controller.signal.aborted) setLoaded({ key, graph: next });
      } catch {
        if (!controller.signal.aborted)
          setError(
            examples
              ? "Fictional reports need an available demo session. You can still open public sources."
              : "The area graph is unavailable. No current condition can be inferred from this failure.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [area, examples, attempt]);
  useEffect(() => {
    const change = () => {
      const params = new URLSearchParams(location.search);
      const next = areas.find((a) => a.id === params.get("area"));
      if (next) setArea(next.id);
      setExamples(params.get("examples") === "1");
    };
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  function navigate(nextArea: PilotId, nextExamples = examples) {
    const url = new URL(location.href);
    url.searchParams.set("area", nextArea);
    if (nextExamples) url.searchParams.set("examples", "1");
    else url.searchParams.delete("examples");
    history.pushState(null, "", url);
    setArea(nextArea);
    setExamples(nextExamples);
  }
  const matching = network.nodes.filter(
    (n) =>
      (!type || n.type === type) &&
      `${n.label} ${n.type} ${n.details?.flat().join(" ") ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const matches = new Set(matching.map((n) => n.id));
  // Retain one-hop context for search matches; every rendered link is a stored assertion.
  const visibleIds = new Set(matches);
  if (query || type)
    for (const edge of network.edges)
      if (matches.has(edge.from) || matches.has(edge.to)) {
        visibleIds.add(edge.from);
        visibleIds.add(edge.to);
      }
  const visibleNodes = network.nodes.filter((n) => visibleIds.has(n.id));
  const visibleEdges = network.edges.filter(
    (e) => visibleIds.has(e.from) && visibleIds.has(e.to),
  );
  const selected =
    selection?.kind === "node"
      ? network.nodes.find((n) => n.id === selection.id)
      : selection?.kind === "edge"
        ? network.edges.find((e) => e.id === selection.id)
        : undefined;
  const labels = new Map(network.nodes.map((n) => [n.id, n.label]));
  const crimeCount = (graph?.nodes ?? []).filter(
    (n) =>
      n.type === "PoliceRecord" ||
      (n.type === "DatasetRecord" &&
        n.provenance?.sourceFamilyId.includes("police")),
  ).length;
  const datasetCount = network.nodes.filter((n) =>
    ["DatasetCoverage", "SourceSnapshot"].includes(n.type),
  ).length;
  function inspect(next: Selection) {
    setSelection(next);
    setCompare(false);
    setInspectorOpen(true);
  }
  return (
    <main className="gx-page">
      <header className="gx-header">
        <a className="gx-brand" href="/">
          Momentum
        </a>
        <button className="button secondary" onClick={() => onExit(area)}>
          <ArrowLeft size={16} />
          Back to area
        </button>
      </header>
      <div className="gx-heading">
        <div>
          <span className="eyebrow">Graphify · connected evidence</span>
          <h1>Area graph</h1>
        </div>
        <div className="gx-areas" aria-label="Graph area">
          {areas.map((a) => (
            <button
              key={a.id}
              aria-pressed={area === a.id}
              onClick={() => navigate(a.id)}
            >
              {a.id === "camden_town" ? "Camden" : a.shortName}
            </button>
          ))}
        </div>
      </div>
      <div className="gx-summary">
        <strong>{areaName}</strong>
        <span>
          {graph
            ? `${network.nodes.length} nodes · ${network.edges.length} edges${researchActive ? ` · ${research.label}` : ` · ${datasetCount} datasets and snapshots`}`
            : "Loading source relationships"}
        </span>
        <label className="gx-demo">
          <input
            type="checkbox"
            checked={examples}
            disabled={Boolean(researchActive)}
            onChange={(e) => navigate(area, e.target.checked)}
          />
          Include fictional reports
        </label>
      </div>
      {examples && !researchActive && (
        <p className="gx-fictional" role="status">
          Fictional reports are demonstration data. They do not describe actual
          incidents.
        </p>
      )}
      <div className="gx-tools">
        <label className="gx-search">
          <Search size={18} />
          <span className="sr-only">Search graph</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a record, place, or source"
          />
        </label>
        <label>
          <span className="sr-only">Record type</span>
          <select
            aria-label="Record type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All record types</option>
            {[...new Set(network.nodes.map((n) => n.type))].sort().map((t) => (
              <option key={t} value={t}>
                {shortType(t)}
              </option>
            ))}
          </select>
        </label>
        <div className="gx-display">
          <button
            aria-pressed={display === "graph"}
            onClick={() => setDisplay("graph")}
          >
            Graph
          </button>
          <button
            aria-pressed={display === "records"}
            onClick={() => setDisplay("records")}
          >
            Records
          </button>
        </div>
        <button
          className="button secondary"
          aria-expanded={inspectorOpen}
          onClick={() => setInspectorOpen((v) => !v)}
        >
          Details and connections
        </button>
        <button
          className="gx-refresh"
          aria-label="Refresh area graph"
          onClick={() => {
            setLoaded(null);
            setAttempt((a) => a + 1);
          }}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {import.meta.env.DEV && (
        <GraphDatasetBrowser
          area={area}
          onChange={(next) => {
            setResearch(next);
            setSelection(null);
            setFirst("");
            setSecond("");
            setCompare(false);
            setQuery("");
            setType("");
          }}
        />
      )}
      <div
        className={`gx-workspace ${inspectorOpen ? "gx-inspector-open" : ""}`}
      >
        <section className="gx-stage" aria-label="Area graph visualization">
          {error ? (
            <div className="gx-state" role="alert">
              <GitBranch size={36} />
              <h2>Graph unavailable</h2>
              <p>{error}</p>
              {!researchActive && (
                <button
                  onClick={() => {
                    setLoaded(null);
                    setAttempt((a) => a + 1);
                  }}
                >
                  Retry graph
                </button>
              )}
              {examples && (
                <button onClick={() => navigate(area, false)}>
                  Show public sources
                </button>
              )}
            </div>
          ) : !graph ? (
            <div className="gx-state" role="status">
              Loading area graph...
            </div>
          ) : display === "graph" ? (
            <GraphCanvas
              nodes={visibleNodes}
              edges={visibleEdges}
              selection={selection}
              onSelect={inspect}
              highlightedNodeIds={
                comparison?.nodeIds ??
                (query || type ? [...matches] : undefined)
              }
              highlightedEdgeIds={comparison?.edgeIds}
            />
          ) : (
            <div className="gx-records">
              <h2>Graph records</h2>
              {!matching.length && <p>No matching records.</p>}
              <ul>
                {matching.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => inspect({ kind: "node", id: n.id })}
                      aria-pressed={selection?.id === n.id}
                    >
                      <span>
                        {shortType(n.type)}
                        {n.synthetic ? " · Fictional" : ""}
                      </span>
                      <strong>{n.label}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <aside
          className="gx-inspector"
          aria-label="Graph inspector"
          hidden={!inspectorOpen}
        >
          <button
            className="button secondary gx-close-inspector"
            onClick={() => setInspectorOpen(false)}
          >
            Close details
          </button>
          <section className="gx-inspection" aria-live="polite">
            <span className="eyebrow">
              {selection?.kind === "edge" ? "Connection" : "Record details"}
            </span>
            <h2>{selected?.label ?? "Follow a connection"}</h2>
            {!selected ? (
              <>
                <p>Select a node or edge to inspect its evidence.</p>
                <div className="gx-fact">
                  <strong>{crimeCount}</strong>
                  <span>Individual police records in this view</span>
                </div>
                <p>
                  {crimeCount
                    ? "Police records are historical and use approximate locations."
                    : "Individual police records are not yet linked in this area view. Dataset coverage is shown instead."}
                </p>
              </>
            ) : (
              <>
                <span
                  className={`gx-badge ${selected.synthetic ? "fiction" : ""}`}
                >
                  {selected.synthetic
                    ? "Fictional example"
                    : researchActive
                      ? "Local research record"
                      : "Source record"}
                </span>
                {selection?.kind === "edge" && "from" in selected && (
                  <p className="gx-endpoints">
                    {labels.get(selected.from)}
                    <span>↓</span>
                    {labels.get(selected.to)}
                  </p>
                )}
                <dl>
                  {selected.details?.map(([label, value], i) => (
                    <div key={`${label}:${i}`}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {"sourceUrl" in selected &&
                  selected.sourceUrl?.startsWith("https://") && (
                    <a
                      href={selected.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original source
                    </a>
                  )}
                {selection?.kind === "node" && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setFirst(selected.id);
                      setSecond("");
                      setCompare(true);
                    }}
                  >
                    Compare this record
                  </button>
                )}
              </>
            )}
          </section>
          <section className="gx-comparison">
            <h2>How are records related?</h2>
            <label>
              First record
              <select
                value={first}
                onChange={(e) => {
                  setFirst(e.target.value);
                  setCompare(true);
                }}
              >
                <option value="">Choose a record</option>
                {network.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Second record
              <select
                value={second}
                onChange={(e) => {
                  setSecond(e.target.value);
                  setCompare(true);
                }}
              >
                <option value="">Choose another record</option>
                {network.nodes
                  .filter((n) => n.id !== first)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </label>
            {comparison && (
              <div className="gx-path" aria-live="polite">
                <h3>{comparison.title}</h3>
                <p>{comparison.explanation}</p>
                <ol>
                  {comparison.steps.map((step, i) => (
                    <li key={i}>
                      <strong>{labels.get(step.from) ?? step.from}</strong>
                      <span>{step.label}</span>
                      <strong>{labels.get(step.to) ?? step.to}</strong>
                    </li>
                  ))}
                </ol>
                <p>{comparison.causation}</p>
              </div>
            )}
          </section>
          <section className="gx-cause">
            <h2>Why did it happen?</h2>
            <p>
              These records do not establish a cause. Sharing a source, place,
              or date does not prove that crimes are connected.
            </p>
          </section>
        </aside>
      </div>
      <footer className="gx-footer">
        <span>
          {(query || type) && graph
            ? `${matching.length} matches with their connected context. `
            : ""}
          Edges show recorded relationships. This is not a live crime map.
        </span>
        {graph && !researchActive && (
          <a
            className="button secondary"
            href={`/api/${examples ? "" : "public/"}graph/export?area=${area}`}
            download
          >
            <Download size={16} />
            Download Graphify data
          </a>
        )}
      </footer>
      {graph && researchActive && (
        <button
          className="button secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      ...toGraphifyGraph(graph),
                      metadata: {
                        ...toGraphifyGraph(graph).metadata,
                        source: "Validated local research projection",
                        localResearchOnly: true,
                        publicationAllowed: false,
                      },
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `${area}-local-research-graph-page.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download this Graphify page
        </button>
      )}
      {graph && (
        <details className="gx-limits">
          <summary>Source limits</summary>
          <ul>
            {graph.limitations.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
          <p>
            Node size represents visible connections, not crime frequency or
            personal risk.
          </p>
        </details>
      )}
      {graph?.truncated && (
        <p role="status">
          This graph reached its display limit. More source records exist.
        </p>
      )}
    </main>
  );
}
