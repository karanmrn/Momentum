import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { NetworkEdge, NetworkNode } from "./EvidenceNetwork";
import "./GraphCanvas.css";

type Selection = { kind: "node" | "edge"; id: string } | null;
type Point = { x: number; y: number };
type View = Point & { scale: number };
type Family =
  "area" | "history" | "community" | "place" | "source" | "coverage";
const familyLabels: Record<Family, string> = {
  area: "Area",
  history: "Historical records",
  community: "Community",
  place: "Places & help",
  source: "Sources",
  coverage: "Context & coverage",
};
function family(node: NetworkNode): Family {
  if (node.type === "DatasetRecord") {
    const sourceFamily =
      node.details
        ?.find(([label]) => label.toLowerCase() === "source family")?.[1]
        .toLowerCase() ?? "";
    if (/priorit|(?:^|[-_:])ons(?:$|[-_:])/.test(sourceFamily))
      return "coverage";
    if (/police|metropolitan|(?:^|[-_:])mps(?:$|[-_:])/.test(sourceFamily))
      return "history";
    if (/osm|openstreetmap|naptan|tfl/.test(sourceFamily)) return "place";
    return "coverage";
  }
  if (/^(Research)?Area$/.test(node.type)) return "area";
  if (/Police|Crime/.test(node.type)) return "history";
  if (/Notice|Observation|Summary/.test(node.type)) return "community";
  if (/Place|Help|Asset/.test(node.type)) return "place";
  if (/Source/.test(node.type)) return "source";
  return "coverage";
}
const anchors: Record<Family, Point> = {
  area: { x: 0.5, y: 0.5 },
  history: { x: 0.78, y: 0.3 },
  community: { x: 0.77, y: 0.76 },
  place: { x: 0.24, y: 0.76 },
  source: { x: 0.2, y: 0.28 },
  coverage: { x: 0.5, y: 0.15 },
};

// The layout uses record types and existing edges. Position does not add a relationship.
function layout(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  width: number,
  height: number,
) {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const used = new Map<Family, number>();
  const points = sorted.map((node) => {
    const group = family(node),
      index = used.get(group) ?? 0;
    used.set(group, index + 1);
    const anchor = anchors[group],
      angle = index * 2.399963;
    const radius = 17 * Math.sqrt(index);
    return {
      id: node.id,
      group,
      x: anchor.x * width + Math.cos(angle) * radius,
      y: anchor.y * height + Math.sin(angle) * radius,
    };
  });
  const byId = new Map(points.map((point, index) => [point.id, index]));
  const links = edges.flatMap((edge) => {
    const from = byId.get(edge.from),
      to = byId.get(edge.to);
    return from === undefined || to === undefined || from === to
      ? []
      : [[from, to]];
  });
  // Public projections are bounded. Large alternate projections use the radial seed.
  if (points.length <= 180)
    for (let step = 0; step < 150; step++) {
      const forces = points.map(() => ({ x: 0, y: 0 }));
      for (let a = 0; a < points.length; a++)
        for (let b = a + 1; b < points.length; b++) {
          const dx = points[b].x - points[a].x || 0.01;
          const dy = points[b].y - points[a].y || 0.01;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const strength =
            1000 / (distance * distance) + Math.max(0, 46 - distance) * 0.13;
          const x = (dx / distance) * strength,
            y = (dy / distance) * strength;
          forces[a].x -= x;
          forces[a].y -= y;
          forces[b].x += x;
          forces[b].y += y;
        }
      for (const [a, b] of links) {
        const dx = points[b].x - points[a].x,
          dy = points[b].y - points[a].y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const strength = (distance - 90) * 0.012;
        const x = (dx / distance) * strength,
          y = (dy / distance) * strength;
        forces[a].x += x;
        forces[a].y += y;
        forces[b].x -= x;
        forces[b].y -= y;
      }
      points.forEach((point, index) => {
        const anchor = anchors[point.group];
        point.x += Math.max(
          -8,
          Math.min(8, forces[index].x + (anchor.x * width - point.x) * 0.025),
        );
        point.y += Math.max(
          -8,
          Math.min(8, forces[index].y + (anchor.y * height - point.y) * 0.025),
        );
      });
    }
  if (!points.length) return new Map<string, Point>();
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(
    1.5,
    (width - 96) / Math.max(1, maxX - minX),
    (height - 112) / Math.max(1, maxY - minY),
  );
  const verticalScale =
    width < 540
      ? Math.min(1.5, (height - 112) / Math.max(1, maxY - minY))
      : scale;
  return new Map(
    points.map((point) => [
      point.id,
      {
        x: (point.x - (minX + maxX) / 2) * scale + width / 2,
        y: (point.y - (minY + maxY) / 2) * verticalScale + height / 2,
      },
    ]),
  );
}

export function GraphCanvas({
  nodes,
  edges,
  selection,
  onSelect,
  highlightedNodeIds = [],
  highlightedEdgeIds = [],
}: {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  highlightedNodeIds?: string[];
  highlightedEdgeIds?: string[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    view: View;
  } | null>(null);
  const [width, setWidth] = useState(900);
  const [viewportHeight, setViewportHeight] = useState(850);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const id = useId().replaceAll(":", "");
  const height =
    width < 540
      ? 480
      : Math.max(520, Math.min(860, Math.round(viewportHeight * 0.68)));
  const [offsets, setOffsets] = useState<Record<string, Point>>({});
  const nodeDrag = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
    start: Point;
    scale: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef<string | null>(null);
  const basePoints = useMemo(
    () => layout(nodes, edges, width, height),
    [nodes, edges, width, height],
  );
  const nodeIds = JSON.stringify(nodes.map((node) => node.id).sort());
  const datasetKey = JSON.stringify([
    nodeIds,
    edges.map((edge) => [edge.id, edge.from, edge.to]).sort(),
  ]);
  const points = new Map(
    [...basePoints].map(([key, point]) => {
      const offset = offsets[key] ?? { x: 0, y: 0 };
      return [key, { x: point.x + offset.x, y: point.y + offset.y }];
    }),
  );
  useEffect(() => {
    setOffsets({});
    nodeDrag.current = null;
    suppressClick.current = null;
  }, [datasetKey]);
  const selectedNode =
    selection?.kind === "node"
      ? nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedPoint = selectedNode ? points.get(selectedNode.id) : undefined;
  useEffect(() => {
    if (selection?.kind !== "node") return;
    const base = basePoints.get(selection.id);
    if (!base) return;
    const offset = offsets[selection.id] ?? { x: 0, y: 0 };
    setView((previous) => ({
      scale: previous.scale,
      x:
        width * (width < 540 ? 0.5 : 0.38) -
        (base.x + offset.x) * previous.scale,
      y: height * 0.38 - (base.y + offset.y) * previous.scale,
    }));
    // Focus only on selection changes. Dragging must not recenter the camera.
  }, [selection?.kind, selection?.id]);
  const cardDetails =
    selectedNode?.details
      ?.filter(([label]) =>
        /^(Source|Source family|Source retrieved|Source basis|Source status|Status|Coverage|Published|Published time|Observed time|Reported time|Period|Source months|Precision|Location precision)$/.test(
          label,
        ),
      )
      .slice(0, 4) ?? [];
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, entry.contentRect.width)),
    );
    observer.observe(element);
    const resize = () => setViewportHeight(window.innerHeight);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => setView({ x: 0, y: 0, scale: 1 }), [nodeIds, width]);
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const selectedEdge =
    selection?.kind === "edge"
      ? edges.find((edge) => edge.id === selection.id)
      : undefined;
  const highlightedNodes = new Set(highlightedNodeIds);
  const highlightedEdges = new Set(highlightedEdgeIds);
  if (selection?.kind === "node") {
    highlightedNodes.add(selection.id);
    edges.forEach((edge) => {
      if (edge.from === selection.id || edge.to === selection.id) {
        highlightedNodes.add(edge.from);
        highlightedNodes.add(edge.to);
        highlightedEdges.add(edge.id);
      }
    });
  }
  if (selectedEdge) {
    highlightedNodes.add(selectedEdge.from);
    highlightedNodes.add(selectedEdge.to);
    highlightedEdges.add(selectedEdge.id);
  }
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const radiusFor = (nodeId: string) =>
    Math.min(25, 8 + Math.sqrt(degree.get(nodeId) ?? 0) * 3);
  const hasHighlights = highlightedNodes.size > 0 || highlightedEdges.size > 0;
  const visibleLabels = new Set<string>();
  const labelBoxes: Array<{ x: number; y: number; width: number }> = [];
  const labelCandidates = [...nodes].sort((a, b) => {
    const rank = (node: NetworkNode) =>
      selection?.kind === "node" && selection.id === node.id
        ? 0
        : node.type === "Area"
          ? 1
          : highlightedNodes.has(node.id)
            ? 2
            : 3;
    return rank(a) - rank(b);
  });
  for (const node of labelCandidates) {
    const selected = selection?.kind === "node" && selection.id === node.id;
    if (!(
      selected ||
      highlightedNodes.has(node.id) ||
      node.type === "Area" ||
      (degree.get(node.id) ?? 0) >= 8 ||
      view.scale > 1.6
    ))
      continue;
    const point = points.get(node.id)!;
    const labelWidth = Math.min(node.label.length, 31) * 6.1;
    const box = {
      x: Math.max(
        4,
        Math.min(width - labelWidth - 4, point.x - labelWidth / 2),
      ),
      y: point.y + radiusFor(node.id) + 21,
      width: labelWidth,
    };
    if (
      !selected &&
      labelBoxes.some(
        (other) =>
          Math.abs(other.y - box.y) < 17 &&
          box.x < other.x + other.width + 6 &&
          other.x < box.x + box.width + 6,
      )
    )
      continue;
    visibleLabels.add(node.id);
    labelBoxes.push(box);
  }

  const presentFamilies = [...new Set(nodes.map(family))];
  function resetGraph() {
    setOffsets({});
    setView({ x: 0, y: 0, scale: 1 });
  }
  function zoom(factor: number) {
    setView((previous) => {
      const scale = Math.max(0.65, Math.min(3.5, previous.scale * factor));
      const ratio = scale / previous.scale;
      return {
        scale,
        x: width / 2 - (width / 2 - previous.x) * ratio,
        y: height / 2 - (height / 2 - previous.y) * ratio,
      };
    });
  }
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || drag.current) return;
    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }
  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerId !== drag.current?.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function activate(
    event: KeyboardEvent<SVGGElement>,
    value: NonNullable<Selection>,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(value);
    }
  }
  return (
    <div className="graph-canvas" ref={container}>
      <div className="gc-key" aria-label="Node types">
        {presentFamilies.map((group) => (
          <span key={group}>
            <i className={`gc-dot gc-${group}`} />
            {familyLabels[group]}
          </span>
        ))}
        {nodes.some((node) => node.synthetic) && (
          <span>
            <i className="gc-dot gc-fiction-key" />
            Fictional: orange outline
          </span>
        )}
      </div>
      <div
        className={`gc-viewport ${dragging ? "gc-dragging" : ""}`}
        style={{ height }}
      >
        {!nodes.length ? (
          <div className="gc-empty" role="status">
            <span aria-hidden="true">○</span>
            <strong>No records in this view</strong>
            <p>Change the filters to show available records.</p>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width="100%"
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="group"
              aria-label="Interactive area graph"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                const shifts: Record<string, [number, number]> = {
                  ArrowLeft: [40, 0],
                  ArrowRight: [-40, 0],
                  ArrowUp: [0, 40],
                  ArrowDown: [0, -40],
                };
                const shift = shifts[event.key];
                if (shift) {
                  event.preventDefault();
                  setView((previous) => ({
                    ...previous,
                    x: previous.x + shift[0],
                    y: previous.y + shift[1],
                  }));
                }
                if (event.key === "+" || event.key === "=") {
                  event.preventDefault();
                  zoom(1.3);
                }
                if (event.key === "-") {
                  event.preventDefault();
                  zoom(1 / 1.3);
                }
                if (event.key === "0") {
                  event.preventDefault();
                  resetGraph();
                }
              }}
              onPointerDown={startDrag}
              onPointerMove={(event) => {
                const current = drag.current;
                if (!current || current.pointerId !== event.pointerId) return;
                setView({
                  ...current.view,
                  x: current.view.x + event.clientX - current.clientX,
                  y: current.view.y + event.clientY - current.clientY,
                });
              }}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={() => {
                drag.current = null;
                setDragging(false);
              }}
            >
              <title>Area records and directed evidence relationships</title>
              <defs>
                <pattern
                  id={`${id}-grid`}
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r=".7" fill="#183e33" opacity=".14" />
                </pattern>
                <marker
                  id={`${id}-arrow`}
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto-start-reverse"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#738b80" />
                </marker>
                <marker
                  id={`${id}-active-arrow`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto-start-reverse"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="#e9b170" />
                </marker>
              </defs>
              <rect width={width} height={height} fill={`url(#${id}-grid)`} />
              <g
                transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
              >
                {edges.map((edge) => {
                  const from = points.get(edge.from),
                    to = points.get(edge.to);
                  if (!from || !to) return null;
                  const dx = to.x - from.x,
                    dy = to.y - from.y,
                    distance = Math.max(1, Math.hypot(dx, dy));
                  const inset = radiusFor(edge.to) + 3;
                  const startInset = radiusFor(edge.from) + 3;
                  const path = `M${from.x + (dx / distance) * startInset},${from.y + (dy / distance) * startInset} L${to.x - (dx / distance) * inset},${to.y - (dy / distance) * inset}`;
                  const active = highlightedEdges.has(edge.id),
                    selected =
                      selection?.kind === "edge" && selection.id === edge.id;
                  return (
                    <g
                      key={edge.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      aria-label={`Inspect relationship: ${nodeById.get(edge.from)?.label} · ${edge.label} · ${nodeById.get(edge.to)?.label}`}
                      className={`gc-edge ${active ? "gc-edge-active" : ""} ${hasHighlights && !active ? "gc-muted" : ""}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onSelect({ kind: "edge", id: edge.id })}
                      onKeyDown={(event) =>
                        activate(event, { kind: "edge", id: edge.id })
                      }
                    >
                      <title>{edge.label.replaceAll("_", " ")}</title>
                      <path
                        className="gc-edge-hit"
                        d={path}
                        strokeWidth={22 / view.scale}
                      />
                      <path
                        className="gc-edge-line"
                        d={path}
                        strokeDasharray={
                          /CONTEXT|CANDIDATE|POSSIBLE/i.test(edge.label)
                            ? "5 5"
                            : undefined
                        }
                        markerEnd={`url(#${id}-${active ? "active-" : ""}arrow)`}
                      />
                    </g>
                  );
                })}
                {nodes.map((node) => {
                  const point = points.get(node.id)!,
                    group = family(node);
                  const selected =
                    selection?.kind === "node" && selection.id === node.id;
                  const active = highlightedNodes.has(node.id);
                  const showLabel = visibleLabels.has(node.id);
                  const radius = radiusFor(node.id);
                  const label =
                    node.label.length > 31
                      ? `${node.label.slice(0, 28)}…`
                      : node.label;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${point.x} ${point.y})`}
                      className={`gc-node gc-${group} ${node.synthetic ? "gc-fiction" : ""} ${selected ? "gc-selected" : ""} ${hasHighlights && !active ? "gc-muted" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect ${node.label}, ${node.type}${node.synthetic ? ", fictional" : ""}`}
                      aria-pressed={selected}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (event.button !== 0 || nodeDrag.current) return;
                        suppressClick.current = null;
                        nodeDrag.current = {
                          id: node.id,
                          pointerId: event.pointerId,
                          x: event.clientX,
                          y: event.clientY,
                          start: offsets[node.id] ?? { x: 0, y: 0 },
                          scale: view.scale,
                          moved: false,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        event.stopPropagation();
                        const current = nodeDrag.current;
                        if (!current || current.pointerId !== event.pointerId)
                          return;
                        const dx = event.clientX - current.x,
                          dy = event.clientY - current.y;
                        if (!current.moved && Math.hypot(dx, dy) < 5) return;
                        current.moved = true;
                        setOffsets((previous) => ({
                          ...previous,
                          [current.id]: {
                            x: Math.max(
                              -width * 2,
                              Math.min(
                                width * 2,
                                current.start.x + dx / current.scale,
                              ),
                            ),
                            y: Math.max(
                              -height * 2,
                              Math.min(
                                height * 2,
                                current.start.y + dy / current.scale,
                              ),
                            ),
                          },
                        }));
                      }}
                      onPointerUp={(event) => {
                        event.stopPropagation();
                        const current = nodeDrag.current;
                        if (!current || current.pointerId !== event.pointerId)
                          return;
                        if (current.moved) suppressClick.current = node.id;
                        nodeDrag.current = null;
                        if (
                          event.currentTarget.hasPointerCapture(event.pointerId)
                        )
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          );
                      }}
                      onPointerCancel={() => {
                        nodeDrag.current = null;
                        suppressClick.current = node.id;
                      }}
                      onLostPointerCapture={() => {
                        nodeDrag.current = null;
                      }}
                      onClick={() => {
                        if (suppressClick.current === node.id) {
                          suppressClick.current = null;
                          return;
                        }
                        onSelect({ kind: "node", id: node.id });
                      }}
                      onKeyDown={(event) =>
                        activate(event, { kind: "node", id: node.id })
                      }
                    >
                      <title>
                        {node.label} · {node.type}
                        {node.synthetic ? " · Fictional" : ""}
                      </title>
                      <circle
                        className="gc-node-hit"
                        r={Math.max(radius + 5, 22 / view.scale)}
                      />
                      <circle className="gc-node-halo" r={radius + 6} />
                      <circle className="gc-node-shape" r={radius} />
                      <circle
                        className="gc-node-core"
                        r={group === "area" ? 5 : 3}
                      />
                      {showLabel && (
                        <text
                          className="gc-node-label"
                          y={radius + 21}
                          x={
                            Math.max(
                              Math.min(node.label.length, 31) * 3.05 + 4,
                              Math.min(
                                width -
                                  Math.min(node.label.length, 31) * 3.05 -
                                  4,
                                point.x,
                              ),
                            ) - point.x
                          }
                          textAnchor="middle"
                        >
                          {label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
            {selectedNode && selectedPoint && (
              <aside
                className="gc-source-card"
                tabIndex={0}
                aria-label="Selected source summary"
                aria-live="polite"
                style={{
                  left: Math.max(
                    8,
                    Math.min(
                      width - (width < 540 ? 230 : 270) - 8,
                      selectedPoint.x * view.scale + view.x + 28,
                    ),
                  ),
                  top: Math.max(
                    8,
                    Math.min(
                      height - 250,
                      selectedPoint.y * view.scale + view.y + 28,
                    ),
                  ),
                }}
              >
                <span>
                  {selectedNode.synthetic
                    ? "Fictional record"
                    : selectedNode.type.replace(/([a-z])([A-Z])/g, "$1 $2")}
                </span>
                <strong>{selectedNode.label}</strong>
                <dl>
                  {cardDetails.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            )}
            <div className="gc-controls" aria-label="Graph zoom controls">
              <button
                type="button"
                aria-label="Zoom in"
                disabled={view.scale >= 3.5}
                onClick={() => zoom(1.3)}
              >
                <Plus size={19} />
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={view.scale <= 0.65}
                onClick={() => zoom(1 / 1.3)}
              >
                <Minus size={19} />
              </button>
              <button type="button" aria-label="Fit graph" onClick={resetGraph}>
                <Maximize2 size={18} />
              </button>
            </div>
            <div className="gc-caption">
              <span>Drag nodes to arrange · Drag background to explore</span>
              <output aria-label="Graph zoom">
                {Math.round(view.scale * 100)}%
              </output>
            </div>
          </>
        )}
      </div>
      <div className="gc-footnote">
        <span>
          <i />
          Evidence relationship
        </span>
        <span>
          <i className="gc-context-line" />
          Context only
        </span>
        <span>Size: connection count</span>
        <span>Position is a layout, not geography</span>
        <span>
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>
    </div>
  );
}
