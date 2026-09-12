import { useEffect, useState } from "react";
import { z } from "zod";
import type { PilotId } from "../packages/contracts";
import {
  semanticGraphSchema,
  type SemanticGraph,
} from "../packages/semantic-graph/schema";
export interface ResearchGraphState {
  area: PilotId;
  active: boolean;
  graph: SemanticGraph | null;
  error: string;
  label: string;
}
const itemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  dataset: z.string().max(100),
  title: z.string().max(200),
  totalRecords: z.number().int().nonnegative(),
  areaRecordCount: z.number().int().nonnegative(),
  sourceIds: z.array(z.string().max(1000)).max(500),
  months: z.array(z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)).max(120),
  publicationAllowed: z.literal(false),
});
const catalogSchema = z.object({
  schemaVersion: z.literal("1.0"),
  synthetic: z.literal(false),
  data: z.object({
    datasets: z.array(itemSchema).max(100),
    localResearchOnly: z.literal(true),
    publicationAllowed: z.literal(false),
  }),
});
const recordsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  synthetic: z.literal(false),
  data: z.object({
    graph: semanticGraphSchema,
    total: z.number().int().nonnegative(),
    nextOffset: z.number().int().nonnegative().nullable(),
    dataset: z.object({
      id: z.string(),
      dataset: z.string(),
      title: z.string(),
    }),
    localResearchOnly: z.literal(true),
    publicationAllowed: z.literal(false),
  }),
});
export function GraphDatasetBrowser({
  area,
  onChange,
}: {
  area: PilotId;
  onChange: (state: ResearchGraphState) => void;
}) {
  const [open, setOpen] = useState(false),
    [catalog, setCatalog] = useState<z.infer<typeof itemSchema>[]>([]),
    [catalogArea, setCatalogArea] = useState<PilotId | null>(null),
    [dataset, setDataset] = useState(""),
    [month, setMonth] = useState(""),
    [offset, setOffset] = useState(0),
    [pageInput, setPageInput] = useState("1"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [catalogBusy, setCatalogBusy] = useState(false),
    [total, setTotal] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [attempt, setAttempt] = useState(0);
  const selected =
    catalogArea === area ? catalog.find((d) => d.id === dataset) : undefined;
  useEffect(() => {
    setDataset("");
    setMonth("");
    setOffset(0);
    setPageInput("1");
    setCatalog([]);
    setCatalogArea(null);
    setError("");
    onChange({ area, active: false, graph: null, error: "", label: "" });
  }, [area]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setCatalogBusy(true);
    setError("");
    fetch(`/api/graph/research/catalog?area=${area}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const result = catalogSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setCatalog(result.data.datasets);
          setCatalogArea(area);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "The local dataset store is unavailable. Public source graphs remain available.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogBusy(false);
      });
    return () => controller.abort();
  }, [open, area, attempt]);
  useEffect(() => {
    if (!open || !selected) {
      onChange({ area, active: false, graph: null, error: "", label: "" });
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setTotal(0);
    setNext(null);
    setError("");
    onChange({
      area,
      active: true,
      graph: null,
      error: "",
      label: selected.title,
    });
    const params = new URLSearchParams({
      area,
      dataset: selected.id,
      offset: String(offset),
      limit: "30",
    });
    if (month) params.set("month", month);
    fetch(`/api/graph/research/records?${params}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const result = recordsSchema.parse(await response.json()).data;
        const count = result.graph.nodes.filter(
          (n) => n.type === "DatasetRecord",
        ).length;
        const end = offset + count;
        const expectedNext = end < result.total ? end : null;
        if (
          result.graph.pilotId !== area ||
          result.dataset.id !== selected.id ||
          result.graph.nodes.some((n) => n.synthetic) ||
          result.graph.assertions.some((e) => e.synthetic) ||
          count > 30 ||
          end > result.total ||
          (count === 0 && offset < result.total) ||
          result.nextOffset !== expectedNext ||
          (result.nextOffset !== null && result.nextOffset <= offset)
        )
          throw Error();
        if (!controller.signal.aborted) {
          setTotal(result.total);
          setNext(result.nextOffset);
          onChange({
            area,
            active: true,
            graph: result.graph,
            error: "",
            label: selected.title,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          const message =
            "These dataset records are unavailable. Retry or return to the area overview.";
          setError(message);
          onChange({
            area,
            active: true,
            graph: null,
            error: message,
            label: selected.title,
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [open, area, selected?.id, month, offset, attempt]);
  function choose(value: string) {
    onChange({
      area,
      active: Boolean(value),
      graph: null,
      error: "",
      label: catalog.find((d) => d.id === value)?.title ?? "",
    });
    setTotal(0);
    setNext(null);
    setDataset(value);
    setMonth("");
    setOffset(0);
    setPageInput("1");
  }
  function page(value: number) {
    onChange({
      area,
      active: true,
      graph: null,
      error: "",
      label: selected?.title ?? "",
    });
    setOffset(value);
    setPageInput(String(Math.floor(value / 30) + 1));
  }
  return (
    <section className="gx-datasets" aria-label="Acquired dataset browser">
      <div className="gx-dataset-title">
        <button
          className="button secondary"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            if (open)
              onChange({
                area,
                active: false,
                graph: null,
                error: "",
                label: "",
              });
          }}
        >
          {open ? "Close dataset browser" : "Browse all datasets"}
        </button>
        {open && <span>Local research · publication disabled</span>}
      </div>
      {open && (
        <>
          {catalogBusy ? (
            <p role="status">Loading acquired datasets...</p>
          ) : (
            catalogArea === area && (
              <>
                <p className="gx-dataset-count">
                  {catalog.length} imported datasets ·{" "}
                  {catalog
                    .reduce((sum, d) => sum + d.totalRecords, 0)
                    .toLocaleString("en-GB")}{" "}
                  stored records across all areas. View 30 records at a time.
                </p>
                <div className="gx-dataset-controls">
                  <label>
                    Dataset
                    <select
                      value={dataset}
                      onChange={(e) => choose(e.target.value)}
                    >
                      <option value="">Area overview</option>
                      {catalog.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} ·{" "}
                          {d.areaRecordCount.toLocaleString("en-GB")} area
                          records · {d.id.slice(0, 6)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected && (
                    <label>
                      Source month
                      <select
                        value={month}
                        onChange={(e) => {
                          setMonth(e.target.value);
                          page(0);
                        }}
                      >
                        <option value="">All source months</option>
                        {selected.months
                          .slice()
                          .sort()
                          .reverse()
                          .map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
              </>
            )
          )}
          {selected && (
            <div className="gx-pagination">
              <span role="status">
                {busy
                  ? "Loading dataset records..."
                  : error
                    ? "No dataset page loaded"
                    : `${total ? offset + 1 : 0}-${Math.min(offset + 30, total)} of ${total.toLocaleString("en-GB")} area records`}
              </span>
              <button
                className="button secondary"
                disabled={busy || Boolean(error) || offset === 0}
                onClick={() => page(Math.max(0, offset - 30))}
              >
                Previous records
              </button>
              <button
                className="button secondary"
                disabled={busy || Boolean(error) || next === null}
                onClick={() => next !== null && page(next)}
              >
                Next records
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = Number(pageInput);
                  if (
                    Number.isInteger(value) &&
                    value >= 1 &&
                    value <= Math.max(1, Math.ceil(total / 30))
                  )
                    page((value - 1) * 30);
                }}
              >
                <label>
                  Page
                  <input
                    aria-label="Dataset page"
                    type="number"
                    min="1"
                    max={Math.max(1, Math.ceil(total / 30))}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy || Boolean(error)}
                >
                  Go
                </button>
              </form>
            </div>
          )}
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                className="button secondary"
                onClick={() => setAttempt((v) => v + 1)}
              >
                Retry datasets
              </button>
            </p>
          )}
          <p className="gx-dataset-note">
            Connections show source lineage and research area context.
            Unassigned records stay outside area pages. Private report text is
            excluded.
          </p>
        </>
      )}
    </section>
  );
}
