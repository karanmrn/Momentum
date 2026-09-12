import { useEffect, useState } from "react";
import { areas, personaSchema, type PilotId } from "../packages/contracts";
import { relationReviewViewSchema } from "../packages/relation-review/schema";
import type { RelationReviewView } from "../packages/relation-review";
import "./RelationReview.css";

async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "The review is unavailable.");
  return payload.data;
}
export function RelationReview({ onExit }: { onExit?: () => void }) {
  const [area, setArea] = useState<PilotId>("camden_town"),
    [persona, setPersona] = useState(""),
    [view, setView] = useState<RelationReviewView | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string[]>([]),
    [candidateId, setCandidateId] = useState<string | null>(null),
    [reason, setReason] = useState("");
  useEffect(() => {
    let cancelled = false;
    setView(null);
    setSelected([]);
    setCandidateId(null);
    setError("");
    void (async () => {
      try {
        const session = await request("/api/session");
        const actor = personaSchema.parse(session.persona);
        if (cancelled) return;
        setPersona(actor);
        if (actor !== "moderator") return;
        const data = relationReviewViewSchema.parse(
          await request(`/api/relation-review?area=${area}`),
        );
        if (data.area !== area) throw new Error("The wrong area was returned.");
        if (!cancelled) setView(data);
      } catch (failure) {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "The review is unavailable.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [area, attempt]);
  async function action(path: string, extra: Record<string, unknown> = {}) {
    if (!view || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = relationReviewViewSchema.parse(
        await request(`/api/relation-review${path}`, {
          area,
          expectedRevision: view.revision,
          ...extra,
        }),
      );
      if (data.area !== area) throw new Error("The wrong area was returned.");
      setView(data);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "This action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const reports = new Map(view?.reports.map((report) => [report.id, report]));
  const candidate = view?.candidates.find((item) => item.id === candidateId);
  const candidateReportIds = new Set(
    view?.candidates
      .filter((item) => ["candidate", "approved"].includes(item.status))
      .flatMap((item) => item.participants.map((p) => p.reportId)),
  );
  const latest = view?.events.at(-1);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  return (
    <main className="relation-review">
      <header className="rr-heading">
        <h1>Momentum relation review</h1>
        {onExit && (
          <button type="button" onClick={onExit}>
            Back to website
          </button>
        )}
      </header>
      <p className="rr-boundary">
        Fictional moderator exercise. Candidate links and review groups do not
        establish one incident or independent corroboration.
      </p>
      <div className="rr-toolbar">
        <label>
          Review area
          <select
            value={area}
            disabled={busy}
            onChange={(event) => setArea(event.target.value as PilotId)}
          >
            {areas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh review
        </button>
      </div>
      {error && (
        <p role="alert" className="rr-error">
          {error}
        </p>
      )}
      {persona && persona !== "moderator" ? (
        <section>
          <h2>Demo moderator required</h2>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request("/api/session", { persona: "moderator" });
                setAttempt((value) => value + 1);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Could not select the moderator.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Use demo moderator
          </button>
        </section>
      ) : !view ? (
        <p role="status">Loading private review...</p>
      ) : (
        <>
          <section>
            <div className="rr-heading">
              <h2>Candidate queue</h2>
              <span>Revision {view.revision}</span>
            </div>
            <div className="rr-actions">
              <button
                type="button"
                disabled={busy || view.examplesLoaded}
                onClick={() => void action("/examples")}
              >
                {view.examplesLoaded
                  ? "Fictional examples loaded"
                  : "Load four fictional examples"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("/generate")}
              >
                Generate candidates
              </button>
            </div>
            <p>
              Generation examines up to 40 current reports. Copied accounts stay
              one source origin. Unknown precision stays unknown.
            </p>
            {view.candidates.length ? (
              <ul className="rr-candidates">
                {view.candidates.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={candidateId === item.id}
                      onClick={() => setCandidateId(item.id)}
                    >
                      <strong>
                        {reports.get(item.participants[0].reportId)?.title ??
                          "Unavailable report"}{" "}
                        /{" "}
                        {reports.get(item.participants[1].reportId)?.title ??
                          "Unavailable report"}
                      </strong>
                      <span>
                        {item.status} · {item.independence.replaceAll("_", " ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No candidate pairs have been generated for this area.</p>
            )}
          </section>
          {candidate && (
            <section aria-label="Candidate details">
              <h2>Inspect candidate</h2>
              <div className="rr-two">
                {candidate.participants.map((participant) => {
                  const report = reports.get(participant.reportId);
                  return (
                    <article key={participant.reportId}>
                      <h3>{report?.title ?? "Unavailable report"}</h3>
                      {report && <p>{report.description}</p>}
                      <dl>
                        <dt>Place</dt>
                        <dd>{report?.place ?? "Removed"}</dd>
                        <dt>Spatial precision</dt>
                        <dd>
                          {participant.spatialPrecision.replaceAll("_", " ")}
                        </dd>
                        <dt>Asset reference</dt>
                        <dd>{participant.assetId ?? "Unknown"}</dd>
                        <dt>Reported interval</dt>
                        <dd>
                          {participant.observedFrom} to {participant.observedTo}
                        </dd>
                        <dt>Time precision</dt>
                        <dd>
                          {participant.timePrecision.replaceAll("_", " ")}
                        </dd>
                        <dt>Source family</dt>
                        <dd>{participant.sourceFamilyId}</dd>
                        <dt>Origin</dt>
                        <dd>{participant.originGroupId ?? "Unknown"}</dd>
                        <dt>Source revision</dt>
                        <dd>{participant.reportRevision}</dd>
                      </dl>
                    </article>
                  );
                })}
              </div>
              <ul>
                {candidate.reasonCodes.map((code) => (
                  <li key={code}>{code.replaceAll("_", " ")}</li>
                ))}
              </ul>
              <label>
                Review reason
                <textarea
                  value={reason}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="rr-actions">
                <button
                  type="button"
                  disabled={
                    busy || candidate.status !== "candidate" || !reason.trim()
                  }
                  onClick={() =>
                    void action(`/candidates/${candidate.id}/decision`, {
                      action: "approve",
                      reason,
                    })
                  }
                >
                  Approve operational relation
                </button>
                <button
                  type="button"
                  disabled={
                    busy || candidate.status !== "candidate" || !reason.trim()
                  }
                  onClick={() =>
                    void action(`/candidates/${candidate.id}/decision`, {
                      action: "reject",
                      reason,
                    })
                  }
                >
                  Reject candidate
                </button>
                <button
                  type="button"
                  disabled={
                    busy || candidate.status !== "approved" || !reason.trim()
                  }
                  onClick={() =>
                    void action(`/candidates/${candidate.id}/decision`, {
                      action: "retract",
                      reason,
                    })
                  }
                >
                  Retract relation
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !["candidate", "approved"].includes(candidate.status)
                  }
                  onClick={() =>
                    setSelected(candidate.participants.map((p) => p.reportId))
                  }
                >
                  Select pair for grouping
                </button>
              </div>
              {view.decisions.filter(
                (decision) => decision.candidateId === candidate.id,
              ).length > 0 && (
                <details>
                  <summary>Decision history</summary>
                  <ol>
                    {view.decisions
                      .filter(
                        (decision) => decision.candidateId === candidate.id,
                      )
                      .map((decision) => (
                        <li key={decision.id}>
                          {decision.fromStatus} to {decision.toStatus}:{" "}
                          {decision.reason}
                        </li>
                      ))}
                  </ol>
                </details>
              )}
              {candidate.decisionReason && (
                <p>Latest review: {candidate.decisionReason}</p>
              )}
              <p>
                Approval only links a reported fictional asset issue. It does
                not prove the condition or establish a crime.
              </p>
            </section>
          )}
          <section>
            <h2>Review groups</h2>
            <fieldset disabled={busy}>
              <legend>Reports to group or split</legend>
              {view.reports
                .filter((report) => candidateReportIds.has(report.id))
                .map((report) => (
                  <label className="rr-check" key={report.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(report.id)}
                      onChange={() => toggle(report.id)}
                    />
                    {report.title}
                  </label>
                ))}
            </fieldset>
            <label>
              Group change reason
              <input
                value={reason}
                maxLength={300}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="rr-actions">
              <button
                type="button"
                disabled={busy || selected.length < 2 || !reason.trim()}
                onClick={() =>
                  void action("/clusters/merge", {
                    reportIds: selected,
                    reason,
                  })
                }
              >
                Merge selected reports
              </button>
              <button
                type="button"
                disabled={
                  busy || !latest || latest.action === "undo" || !reason.trim()
                }
                onClick={() =>
                  latest && void action(`/events/${latest.id}/undo`, { reason })
                }
              >
                Undo latest group change
              </button>
            </div>
            {view.clusters.length ? (
              view.clusters.map((cluster, index) => {
                const a = cluster.reportIds.filter((id) =>
                    selected.includes(id),
                  ),
                  b = cluster.reportIds.filter((id) => !selected.includes(id));
                return (
                  <article key={cluster.id}>
                    <h3>Review group {index + 1}</h3>
                    <ul>
                      {cluster.reportIds.map((id) => (
                        <li key={id}>
                          {reports.get(id)?.title ?? "Removed report reference"}
                        </li>
                      ))}
                    </ul>
                    <div className="rr-actions">
                      <button
                        type="button"
                        disabled={
                          busy || !reason.trim() || !a.length || !b.length
                        }
                        onClick={() =>
                          void action(`/clusters/${cluster.id}/split`, {
                            partitions: [a, b],
                            reason,
                          })
                        }
                      >
                        Split selected members
                      </button>
                      <button
                        type="button"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          void action(`/clusters/${cluster.id}/split`, {
                            partitions: cluster.reportIds.map((id) => [id]),
                            reason,
                          })
                        }
                      >
                        Ungroup all members
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <p>No review groups exist.</p>
            )}
            <p>
              Groups contain selected review material. A group never creates
              additional pairwise identity links.
            </p>
          </section>
          <section>
            <h2>Group history</h2>
            {view.events.length ? (
              <ol>
                {view.events.map((event) => (
                  <li key={event.id}>
                    <strong>{event.action}</strong> ·{" "}
                    {new Date(event.at).toLocaleString("en-GB")}
                    <p>{event.reason}</p>
                    {event.action === "undo" && (
                      <span>
                        Earlier grouping restored. Reports and relation
                        decisions remain unchanged.
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No grouping actions have been recorded.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
