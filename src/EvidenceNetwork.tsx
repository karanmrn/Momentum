import { useEffect, useId, useRef, useState } from "react";
import "./EvidenceNetwork.css";

export interface NetworkNode {
  id: string;
  label: string;
  type: string;
  synthetic: boolean;
  details?: Array<[string, string]>;
  sourceUrl?: string | null;
}
export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  synthetic: boolean;
  details?: Array<[string, string]>;
}

export function EvidenceNetwork({
  nodes,
  edges,
  title = "Connected evidence",
}: {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const prefix = useId().replaceAll(":", "");
  const [width, setWidth] = useState(700);
  const [selection, setSelection] = useState<{
    kind: "node" | "edge";
    id: string;
  } | null>(null);
  const [view, setView] = useState<"network" | "records">("network");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!selection || !detailRef.current) return;
    detailRef.current.focus({ preventScroll: true });
    detailRef.current.scrollIntoView({ block: "center", behavior: "instant" });
  }, [selection]);
  const selectedNode =
    selection?.kind === "node"
      ? nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.kind === "edge"
      ? edges.find((edge) => edge.id === selection.id)
      : undefined;
  const narrow = width < 540;
  const gap = narrow ? 20 : 36;
  const nodeWidth = narrow
    ? Math.max(160, width - 64)
    : Math.max(100, (width - gap * 4) / 3);
  const rows = [0, 0, 0];
  const points = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const lane = narrow
      ? 0
      : node.synthetic
        ? 2
        : /area|place/i.test(node.type)
          ? 1
          : 0;
    const row = rows[lane]++;
    points.set(node.id, {
      x: narrow ? 32 : gap + lane * (nodeWidth + gap),
      y: 24 + row * 116,
    });
  });
  const height = Math.max(180, Math.max(...rows) * 116 + 32);
  const matched = nodes.filter((node) =>
    `${node.label} ${node.type}`.toLowerCase().includes(query.toLowerCase()),
  );
  const matchIds = new Set(matched.map((node) => node.id));
  const describe = selectedNode ?? selectedEdge;
  const details = describe?.details ?? [];
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return (
    <section className="evidence-network" aria-label={title}>
      <div className="en-toolbar">
        <h3>{title}</h3>
        <span className="en-count">
          {nodes.length} nodes · {edges.length} edges
        </span>
        <div className="en-view" aria-label="Evidence display">
          <button
            type="button"
            aria-pressed={view === "network"}
            onClick={() => setView("network")}
          >
            Network
          </button>
          <button
            type="button"
            aria-pressed={view === "records"}
            onClick={() => setView("records")}
          >
            Records
          </button>
        </div>
      </div>
      <div className="en-legend">
        <span>Source or area record</span>
        <span className="en-fiction-key">Fictional record</span>
        <span>Dashed edge: context only</span>
      </div>
      <label className="en-search">
        Find a record
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or record type"
        />
      </label>
      {query && (
        <p role="status">
          {matched.length} matching records. Other graph records remain visible.
        </p>
      )}
      <div ref={ref} className="en-canvas-container">
        {view === "network" ? (
          <div className="en-canvas" style={{ height }}>
            <svg
              width="100%"
              height={height}
              aria-label="Connections between evidence records"
              role="img"
            >
              <title>Connections between evidence records</title>
              <defs>
                <marker
                  id={`${prefix}-arrow`}
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L7,3.5 L0,7" fill="#718779" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = points.get(edge.from),
                  to = points.get(edge.to);
                if (!from || !to) return null;
                const sameLane = from.x === to.x;
                const startX = sameLane
                  ? from.x
                  : from.x + (from.x < to.x ? nodeWidth : 0);
                const endX = sameLane
                  ? to.x
                  : to.x + (from.x < to.x ? 0 : nodeWidth);
                const startY = from.y + 40,
                  endY = to.y + 40;
                const bend = sameLane
                  ? Math.max(4, from.x - 23)
                  : (startX + endX) / 2;
                const path = `M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`;
                return (
                  <path
                    key={edge.id}
                    d={path}
                    fill="none"
                    stroke={
                      selectedEdge?.id === edge.id ? "#a45c30" : "#718779"
                    }
                    strokeWidth={selectedEdge?.id === edge.id ? 3 : 1.6}
                    strokeDasharray={
                      /context|area/i.test(edge.label) ? "5 4" : undefined
                    }
                    markerEnd={`url(#${prefix}-arrow)`}
                  >
                    <title>
                      {labels.get(edge.from)}: {edge.label}:{" "}
                      {labels.get(edge.to)}
                    </title>
                  </path>
                );
              })}
            </svg>
            {nodes.map((node) => {
              const point = points.get(node.id)!;
              return (
                <button
                  type="button"
                  key={node.id}
                  className={`en-node ${node.synthetic ? "en-fiction" : ""} ${query && !matchIds.has(node.id) ? "en-muted" : ""}`}
                  style={{ left: point.x, top: point.y, width: nodeWidth }}
                  aria-label={`Inspect ${node.label}`}
                  aria-pressed={selectedNode?.id === node.id}
                  onClick={() => setSelection({ kind: "node", id: node.id })}
                >
                  <span>
                    {node.type.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}
                    {node.synthetic ? " · Fictional" : ""}
                  </span>
                  <strong>{node.label}</strong>
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="en-records">
            {matched.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => setSelection({ kind: "node", id: node.id })}
                >
                  <strong>{node.label}</strong>
                  <span>
                    {node.type} ·{" "}
                    {node.synthetic ? "Fictional" : "Source or area record"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="en-edge-picker">
        Inspect a relationship
        <select
          value={selectedEdge?.id ?? ""}
          onChange={(event) =>
            setSelection(
              event.target.value
                ? { kind: "edge", id: event.target.value }
                : null,
            )
          }
        >
          <option value="">Choose a relationship</option>
          {edges.map((edge) => (
            <option key={edge.id} value={edge.id}>
              {labels.get(edge.from)} - {edge.label} - {labels.get(edge.to)}
            </option>
          ))}
        </select>
      </label>
      {describe ? (
        <div
          ref={detailRef}
          tabIndex={-1}
          className="en-detail"
          aria-label="Selected evidence details"
          role="region"
        >
          <h4>{selectedNode?.label ?? selectedEdge?.label}</h4>
          <p>
            {describe.synthetic
              ? "Fictional demonstration"
              : "Source or area record"}
          </p>
          {selectedEdge && (
            <p>
              {labels.get(selectedEdge.from)} → {labels.get(selectedEdge.to)}
            </p>
          )}
          <dl>
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {selectedNode?.sourceUrl?.startsWith("https://") && (
            <a href={selectedNode.sourceUrl} target="_blank" rel="noreferrer">
              Read selected source
            </a>
          )}
        </div>
      ) : (
        <p className="en-hint">
          Select a node or relationship to inspect its source and limits.
        </p>
      )}
      {!nodes.length && <p>No records are available in this projection.</p>}
    </section>
  );
}
