import { useEffect, useRef, useState } from "react";
import { areas, type PilotId } from "../packages/contracts";
import type { AnalyticsState, AnalysisRun } from "../packages/analytics/src";
import "./AnalysisWorkspace.css";
async function request<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? "Research data could not load.");
  return data.data;
}
export function AnalysisWorkspace({ onExit }: { onExit?: () => void }) {
  const [area, setArea] = useState<PilotId>("camden_town");
  const [state, setState] = useState<AnalyticsState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  async function reload() {
    const version = ++generation.current;
    setBusy(true);
    try {
      const next = await request<AnalyticsState>(`/api/analytics?area=${area}`);
      if (version === generation.current) setState(next);
    } catch (error) {
      if (version === generation.current) throw error;
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const version = ++generation.current;
    setSelected(null);
    setNote("");
    setState(null);
    setError("");
    request<AnalyticsState>(`/api/analytics?area=${area}`)
      .then((value) => {
        if (active && version === generation.current) setState(value);
      })
      .catch((e) => {
        if (active && version === generation.current) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [area]);
  async function run() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<AnalysisRun>(
        "/api/analytics/runs",
        { area, expectedRevision: state.revision },
        crypto.randomUUID(),
      );
      setSelected(result.id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string, decision: "approved_demo" | "rejected") {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/analytics/runs/${id}/review`, {
        expectedRevision: state.revision,
        decision,
        note,
      });
      setNote("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const runView =
    state?.runs.find((r) => r.id === selected) ?? state?.runs.at(-1);
  function download(run: AnalysisRun) {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            warning: "Invented demonstration data. Not empirical evidence.",
            ...run,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `momentum-fictional-analysis-${run.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="analysis-workspace">
      <header>
        <strong>Momentum</strong>
        {onExit && (
          <button className="button secondary" onClick={onExit}>
            Back to area
          </button>
        )}
      </header>
      <h1>Research comparisons</h1>
      <section className="analysis-status">
        <h2>Real data: insufficient history</h2>
        <p>
          No comparable real community history exists yet. Pilot boundaries
          require review before exact area analysis.
        </p>
      </section>
      <div className="analysis-tools">
        <label>
          Area
          <select
            value={area}
            disabled={busy}
            onChange={(e) => setArea(e.target.value as PilotId)}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button" onClick={run} disabled={busy || !state}>
          Run fictional comparison
        </button>
      </div>
      {error && (
        <div role="alert" className="analysis-status">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => reload().catch((e) => setError(e.message))}
          >
            Reload research
          </button>
        </div>
      )}
      {!state && !error && <p role="status">Loading research...</p>}
      {state && (
        <section>
          <h2>Fictional runs</h2>
          <div className="analysis-runs">
            {state.runs.length ? (
              state.runs.map((r) => (
                <button
                  className="button secondary"
                  key={r.id}
                  aria-pressed={r.id === runView?.id}
                  disabled={busy}
                  onClick={() => setSelected(r.id)}
                >
                  {new Date(r.result.generatedAt).toLocaleTimeString()} ·{" "}
                  {r.result.reviewStatus.replaceAll("_", " ")}
                </button>
              ))
            ) : (
              <p>No fictional runs saved.</p>
            )}
          </div>
        </section>
      )}
      {runView && (
        <article className="analysis-result">
          <h2>Invented demonstration data</h2>
          <p>
            This comparison explains the method. It does not describe real
            reports, crime, or personal risk.
          </p>
          <dl>
            <div>
              <dt>Result</dt>
              <dd>{runView.result.status.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Spearman coefficient</dt>
              <dd>{runView.result.estimate?.toFixed(3) ?? "Not calculated"}</dd>
            </div>
            <div>
              <dt>Common months</dt>
              <dd>{runView.result.nCommonPeriods}</dd>
            </div>
            <div>
              <dt>Missing pairs</dt>
              <dd>{runView.result.missingness.paired}</dd>
            </div>
            <div>
              <dt>Unit</dt>
              <dd>One fictional pilot month</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>{runView.result.reviewStatus.replaceAll("_", " ")}</dd>
            </div>
          </dl>
          <h3>Interpretation limits</h3>
          <ul>
            {runView.result.limitations.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>No confidence interval or significance test is reported.</p>
          <details>
            <summary>Registered question and source versions</summary>
            <dl>
              <div>
                <dt>Question</dt>
                <dd>{runView.question.title}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  {runView.question.period.from} to {runView.question.period.to}
                </dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{runView.result.methodVersion}</dd>
              </div>
              <div>
                <dt>Multiplicity</dt>
                <dd>{runView.result.multiplicityHandling}</dd>
              </div>
              {runView.inputs.map((s) => (
                <div key={s.id}>
                  <dt>{s.id}</dt>
                  <dd>
                    {s.sourceVersion} · {s.geographyVersion} ·{" "}
                    {s.taxonomyVersion}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <details>
            <summary>Aligned fictional observations</summary>
            <div className="analysis-table" tabIndex={0}>
              <table>
                <caption>Invented monthly counts</caption>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Submissions</th>
                    <th>Publications</th>
                  </tr>
                </thead>
                <tbody>
                  {runView.inputs[0].values.map((v, i) => (
                    <tr key={v.month}>
                      <td>{v.month}</td>
                      <td>{v.count ?? "Missing"}</td>
                      <td>{runView.inputs[1].values[i]?.count ?? "Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <label>
            Review note
            <textarea
              value={note}
              maxLength={300}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="analysis-tools">
            <button
              className="button"
              disabled={busy || note.trim().length < 5}
              onClick={() => review(runView.id, "approved_demo")}
            >
              Approve demonstration
            </button>
            <button
              className="button secondary"
              disabled={busy || note.trim().length < 5}
              onClick={() => review(runView.id, "rejected")}
            >
              Reject run
            </button>
            <button
              className="button secondary"
              onClick={() => download(runView)}
            >
              Export fictional inputs and result
            </button>
          </div>
          {runView.reviewNote && <p>Review note: {runView.reviewNote}</p>}
        </article>
      )}
    </main>
  );
}
