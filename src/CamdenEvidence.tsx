import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { EvidenceNetwork } from "./EvidenceNetwork";
import {
  buildCaseGraph,
  fictionalScenarios,
  policeSelection,
  reportingSources,
  type DemoRevision,
  type ExampleId,
} from "../packages/camden-evidence";
import "./camden-evidence.css";

const exampleStateSchema = z.enum(["original", "corrected", "withdrawn"]);
const studySchema = z
  .object({
    revision: z.number().int().positive(),
    examples: z
      .object({
        "CAM-01": exampleStateSchema,
        "CAM-02": exampleStateSchema,
        "CAM-03": exampleStateSchema,
        "CAM-04": exampleStateSchema,
        "CAM-05": exampleStateSchema,
      })
      .strict(),
  })
  .strict();
type Study = z.infer<typeof studySchema>;
const receiptSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  status: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  synthetic: z.literal(true),
});
class StudyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function studyRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new StudyError(
      body?.error?.message || "The fictional study is unavailable. Try again.",
      response.status,
    );
  if (body?.schemaVersion !== "1.0")
    throw new Error("The study response is invalid. Try again.");
  return body.data;
}
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));

export function CamdenEvidence({ onExit }: { onExit?: () => void } = {}) {
  const [selected, setSelected] = useState<ExampleId>("CAM-01");
  const [study, setStudy] = useState<Study | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<z.infer<typeof receiptSchema> | null>(
    null,
  );
  const [receiptExample, setReceiptExample] = useState<ExampleId | null>(null);
  const pending = useRef(false);
  const reportKeys = useRef(new Map<string, string>());
  async function loadStudy() {
    const next = studySchema.parse(await studyRequest("/api/camden/examples"));
    setStudy(next);
    return next;
  }
  useEffect(() => {
    let active = true;
    studyRequest("/api/camden/examples")
      .then((data) => {
        const next = studySchema.parse(data);
        if (active) setStudy(next);
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "The study is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function recover(failure: unknown) {
    let message =
      failure instanceof Error
        ? failure.message
        : "The change could not be saved. Try again.";
    if (failure instanceof StudyError && failure.status === 409) {
      try {
        await loadStudy();
        message =
          "This example changed elsewhere. The latest saved state is shown. Review it and try again.";
      } catch {
        setStudy(null);
        message =
          "This example changed elsewhere. Reload the study before retrying.";
      }
    }
    setError(message);
  }
  async function retryStudy() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await loadStudy();
      setError("");
    } catch (failure) {
      await recover(failure);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const record = policeSelection.records.find(
    (row) => row.exampleId === selected,
  )!;
  const scenario = fictionalScenarios.find(
    (row) => row.id === `fictional:${selected}`,
  )!;
  const state = study?.examples[selected] ?? "withdrawn";
  const graph = buildCaseGraph(selected, state);
  async function changeState(next: DemoRevision) {
    if (!study || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const saved = studySchema.parse(
        await studyRequest(`/api/camden/examples/${selected}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: study.revision,
            state: next,
          }),
        }),
      );
      setStudy(saved);
      setError("");
    } catch (failure) {
      await recover(failure);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reportExample() {
    if (!study || pending.current || state === "withdrawn") return;
    const example = selected;
    const key = `${example}:${study.revision}`;
    if (!reportKeys.current.has(key))
      reportKeys.current.set(key, crypto.randomUUID());
    pending.current = true;
    setBusy(true);
    try {
      const saved = receiptSchema.parse(
        await studyRequest(`/api/camden/examples/${example}/report`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": reportKeys.current.get(key)!,
          },
          body: JSON.stringify({ expectedRevision: study.revision }),
        }),
      );
      setReceipt(saved);
      setReceiptExample(example);
      setError("");
    } catch (failure) {
      await recover(failure);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="camden-evidence">
      <header className="ce-heading">
        <div>
          <span className="ce-kicker">Camden evidence study</span>
          <h1>What can each source tell us?</h1>
        </div>
        {onExit && (
          <button onClick={onExit} className="ce-button">
            Back to Momentum
          </button>
        )}
      </header>
      <div className="ce-boundary">
        <strong>
          Five real police records. Five separate fictional accounts.
        </strong>
        <p>
          None of the fictional accounts is a known match to a police record.
          This page compares record fields.
        </p>
      </div>
      <div className="ce-facts">
        <span>
          Police reporting month <strong>July 2026</strong>
        </span>
        <span>
          Selected rows checked{" "}
          <strong>{dateTime(policeSelection.recheckedAt)} London time</strong>
        </span>
        <span>
          Purpose <strong>Research example, not a current alert</strong>
        </span>
      </div>
      <nav className="ce-select" aria-label="Select a police record">
        {policeSelection.records.map((row, index) => (
          <button
            key={row.exampleId}
            aria-pressed={selected === row.exampleId}
            onClick={() => setSelected(row.exampleId)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{row.exampleId}</strong>
            <small>
              {row.raw.location.street.name.replace("On or near ", "")}
            </small>
          </button>
        ))}
      </nav>
      <section className="ce-card" aria-label="Camden graph workspace">
        <h2>Graph evidence</h2>
        <p>
          The police record and fictional account share broad area context only.
          No same-incident link is established.
        </p>
        {error && (
          <div role="alert" className="error">
            <p>{error}</p>
            <button
              className="ce-button"
              disabled={busy}
              onClick={() => void retryStudy()}
            >
              Reload study
            </button>
            <a href="/?demo=1&area=camden_town">Open demonstration access</a>
          </div>
        )}
        {!study && !error && (
          <p role="status">
            Loading saved fictional study. Public source records remain
            available.
          </p>
        )}
        <EvidenceNetwork
          title="Camden evidence network"
          nodes={graph.nodes.map((node) => ({
            id: node.id,
            label: node.label,
            type: node.type,
            synthetic: node.synthetic,
            sourceUrl: node.provenance?.sourceUrl,
            details: [
              ["Precision", node.precision.replaceAll("_", " ")],
              ["Revision", String(node.revision)],
              ...(node.provenance
                ? ([
                    ["Source family", node.provenance.sourceFamilyId],
                    ["Retrieved", dateTime(node.provenance.fetchedAt)],
                  ] as Array<[string, string]>)
                : []),
              ...(node.observedAt
                ? [
                    ["Fictional observed time", dateTime(node.observedAt)] as [
                      string,
                      string,
                    ],
                  ]
                : []),
              ...(node.correctionNote
                ? [["Correction", node.correctionNote] as [string, string]]
                : []),
            ],
          }))}
          edges={graph.assertions.map((edge) => ({
            id: edge.id,
            from: edge.subjectId,
            to: edge.objectId,
            label:
              edge.predicate === "DERIVED_FROM"
                ? "Derived from"
                : "Area context only",
            synthetic: edge.synthetic,
            details: [
              ["Method", edge.inferenceType.replaceAll("_", " ")],
              ["Reason", edge.reasonCodes.join(", ").replaceAll("_", " ")],
              ["Independence", edge.independence],
              ["Time precision", edge.timePrecision.replaceAll("_", " ")],
              ["Source family", edge.sourceFamilyId],
            ],
          }))}
        />
        {study && (
          <p>
            Saved study revision {study.revision}. Changes remain in this
            fictional session after reload.
          </p>
        )}
        <a
          className="ce-button"
          href={`/api/${study ? "" : "public/"}graph/export?area=camden_town`}
          download
        >
          Download Graphify graph
        </a>
      </section>
      <div className="ce-columns">
        <section className="ce-card" aria-labelledby="ce-police-title">
          <span className="ce-label">Real public source</span>
          <h2 id="ce-police-title">{selected} · Police record</h2>
          <p className="ce-record-title">{record.raw.location.street.name}</p>
          <dl className="ce-fields">
            <div>
              <dt>Published category</dt>
              <dd>
                Violence and sexual offences <code>{record.raw.category}</code>
              </dd>
            </div>
            <div>
              <dt>Recorded month</dt>
              <dd>{record.raw.month} · exact incident date unknown</dd>
            </div>
            <div>
              <dt>Published outcome</dt>
              <dd>
                {record.raw.outcome_status?.category ?? "Not supplied"}
                <small>
                  Outcome month:{" "}
                  {record.raw.outcome_status?.date ?? "Not supplied"}
                </small>
              </dd>
            </div>
            <div>
              <dt>Sexual assault or battery?</dt>
              <dd>Cannot determine from this record.</dd>
            </div>
            <div>
              <dt>What happened?</dt>
              <dd>No narrative is supplied.</dd>
            </div>
            <div>
              <dt>Exact time and people</dt>
              <dd>
                Not supplied. Victim gender and participant roles are unknown.
              </dd>
            </div>
            <div>
              <dt>Evidence collected</dt>
              <dd>
                Not supplied. An outcome label does not describe the evidence.
              </dd>
            </div>
          </dl>
          <p className="ce-note">
            The category combines different offences. It cannot establish a
            sexual element, battery, or a link to women’s safety.
          </p>
          <details>
            <summary>Source record and provenance</summary>
            <dl className="ce-fields">
              <div>
                <dt>API record ID</dt>
                <dd>{record.raw.id}</dd>
              </div>
              <div>
                <dt>Persistent public ID</dt>
                <dd>
                  <code>{record.raw.persistent_id}</code>
                </dd>
              </div>
              <div>
                <dt>Public street ID</dt>
                <dd>
                  {record.raw.location.street.id} · not a police case reference
                </dd>
              </div>
              <div>
                <dt>Anonymised map point</dt>
                <dd>
                  {record.raw.location.latitude},{" "}
                  {record.raw.location.longitude} · not the exact incident
                  location
                </dd>
              </div>
              <div>
                <dt>Source fetched</dt>
                <dd>{dateTime(policeSelection.sourceFetchedAt)} London time</dd>
              </div>
              <div>
                <dt>Original snapshot SHA256</dt>
                <dd>
                  <code>{policeSelection.sourceSnapshotSha256}</code>
                </dd>
              </div>
              <div>
                <dt>Recheck snapshot SHA256</dt>
                <dd>
                  <code>{policeSelection.recheckedSnapshotSha256}</code>
                </dd>
              </div>
              <div>
                <dt>Recheck result</dt>
                <dd>
                  The full response changed. All five selected rows were
                  unchanged.
                </dd>
              </div>
            </dl>
            <a
              href={policeSelection.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Police.uk response
            </a>
          </details>
        </section>
        {study && (
          <section
            className="ce-card ce-fiction"
            aria-labelledby="ce-fiction-title"
          >
            <span className="ce-label">
              Fictional exercise · no real event match
            </span>
            <h2 id="ce-fiction-title">{scenario.title}</h2>
            <p className="ce-note">
              All details below are invented. The precise times illustrate
              unverified self-reports, not verified event times.
            </p>
            <div className="ce-summary">
              <h3>Public summary example</h3>
              <p>
                {state === "withdrawn"
                  ? "This fictional account has been withdrawn. Its summary and derived graph links are removed."
                  : scenario.publicSummary}
              </p>
              {state === "corrected" && (
                <p className="ce-note">
                  <strong>Correction, revision 2:</strong> {scenario.correction}
                </p>
              )}
            </div>
            {state !== "withdrawn" && (
              <details>
                <summary>Fictional intake detail</summary>
                <p>{scenario.account}</p>
                <dl className="ce-fields">
                  <div>
                    <dt>Reported occurrence time</dt>
                    <dd>
                      {dateTime(
                        state === "corrected"
                          ? scenario.correctedObservedAt
                          : scenario.observedAt,
                      )}{" "}
                      London time · fictional and unverified
                    </dd>
                  </div>
                  <div>
                    <dt>Submitted time</dt>
                    <dd>
                      {dateTime(scenario.reportedAt)} London time · fictional
                    </dd>
                  </div>
                  <div>
                    <dt>Participant roles</dt>
                    <dd>
                      {scenario.participantRoles.join("; ")}. No real names or
                      identity nodes.
                    </dd>
                  </div>
                  <div>
                    <dt>Relationship to police record</dt>
                    <dd>
                      No known match. Position beside this record is a display
                      choice.
                    </dd>
                  </div>
                </dl>
              </details>
            )}
            <section
              className="ce-revision"
              aria-label="Fictional report submission"
            >
              <h3>Try the reporting journey</h3>
              <p>
                This creates a private fictional report in a demonstration
                session. It does not send a real report.
              </p>
              <button
                className="ce-button"
                disabled={
                  busy || state === "withdrawn" || receiptExample === selected
                }
                onClick={() => void reportExample()}
              >
                Report this example
              </button>
              {receipt && receiptExample === selected && (
                <div className="ce-summary" role="status">
                  <h3>Saved for private review</h3>
                  <dl className="ce-fields">
                    <div>
                      <dt>Report reference</dt>
                      <dd>{receipt.id}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{receipt.status.replaceAll("_", " ")}</dd>
                    </div>
                    <div>
                      <dt>Revision</dt>
                      <dd>{receipt.revision}</dd>
                    </div>
                    <div>
                      <dt>Saved</dt>
                      <dd>{dateTime(receipt.createdAt)}</dd>
                    </div>
                  </dl>
                  <a href="/?demo=1&area=camden_town&view=reports">
                    Open My reports
                  </a>
                </div>
              )}
            </section>
            <section
              className="ce-revision"
              aria-label="Fictional correction controls"
            >
              <h3>Try a correction</h3>
              <p>
                These controls update this saved fictional study. Police source
                records remain unchanged.
              </p>
              <div className="ce-actions">
                <button
                  className="ce-button"
                  disabled={busy || state !== "original"}
                  onClick={() => changeState("corrected")}
                >
                  Correct fictional time
                </button>
                <button
                  className="ce-button"
                  disabled={busy || state === "withdrawn"}
                  onClick={() => changeState("withdrawn")}
                >
                  Withdraw fictional account
                </button>
                <button
                  className="ce-button"
                  disabled={busy || state === "original"}
                  onClick={() => changeState("original")}
                >
                  Reset example
                </button>
              </div>
              <p role="status" aria-live="polite">
                Fictional state: {state}. Police source record unchanged.
              </p>
            </section>
          </section>
        )}
      </div>
      <section className="ce-card ce-context">
        <h2>What enriched data means</h2>
        <p>
          Enrichment adds labelled context and provenance. It does not fill
          missing incident facts with guesses.
        </p>
        <div className="ce-context-grid">
          <article>
            <h3>Police source</h3>
            <p>
              Category, reporting month, approximate place, outcome, source
              snapshot, and public record identifiers.
            </p>
          </article>
          <article>
            <h3>Area context</h3>
            <p>
              Help listings, transport identities, lighting inventories, and
              source dates can describe the surrounding area. They cannot
              confirm this incident.
            </p>
          </article>
          <article>
            <h3>Community contribution</h3>
            <p>
              A contributor can describe observed behaviour and recalled time.
              Review, independent support, and source precision remain separate.
            </p>
          </article>
        </div>
        <div className="ce-context-grid">
          {reportingSources.areaContext.map((context) => (
            <article key={context.id}>
              <h3>{context.title}</h3>
              <p>{context.summary}</p>
              {"responseSummary" in context && (
                <p>{context.responseSummary} Completion is not verified.</p>
              )}
              {"validFrom" in context && (
                <p>
                  Listed window: {dateTime(context.validFrom)} to{" "}
                  {dateTime(context.validTo)} London time. Actual deployment is
                  unconfirmed.
                </p>
              )}
              <p className="ce-note">
                Checked {dateTime(context.retrievedAt)} London time. This source
                does not describe any selected July incident.
              </p>
              <a href={context.sourceUrl} target="_blank" rel="noreferrer">
                Open {context.sourceFamilyId} source
              </a>
            </article>
          ))}
        </div>
        <p className="ce-note">
          Source independence is unknown. Shared source family does not
          establish independent corroboration.
        </p>
        <p className="ce-note">
          The sample uses a one-mile research circle. It is not an approved
          Camden Town boundary or a representative crime sample.
        </p>
      </section>
      <section className="ce-card">
        <h2>Graph records and assertions</h2>
        <p>
          The real record and the fictional account connect only through broad
          area context. There is no same-incident relationship.
        </p>
        <div className="ce-graph-overview">
          <span>Police snapshot → Real source row</span>
          <span>Broad display context only</span>
          <span>
            {state === "withdrawn"
              ? "Fictional evidence removed"
              : "Fictional account → Redacted summary"}
          </span>
        </div>
        <details>
          <summary>
            Inspect {graph.nodes.length} nodes and {graph.assertions.length}{" "}
            qualified assertions
          </summary>
          <div className="ce-table-wrap">
            <table>
              <caption>Evidence nodes</caption>
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Source class</th>
                  <th>Precision</th>
                  <th>Revision</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((node) => (
                  <tr key={node.id}>
                    <th scope="row">{node.label}</th>
                    <td>
                      {node.synthetic
                        ? "Fictional"
                        : "Real source or area metadata"}
                    </td>
                    <td>
                      {node.precision.replaceAll("_", " ")}
                      {node.observedAt && (
                        <>
                          <br />
                          Fictional reported time: {dateTime(node.observedAt)}
                        </>
                      )}
                      {node.correctionNote && (
                        <>
                          <br />
                          {node.correctionNote}
                        </>
                      )}
                    </td>
                    <td>{node.revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ce-table-wrap">
            <table>
              <caption>Qualified assertions</caption>
              <thead>
                <tr>
                  <th>Relationship</th>
                  <th>Method</th>
                  <th>Reason</th>
                  <th>Source family</th>
                </tr>
              </thead>
              <tbody>
                {graph.assertions.map((edge) => (
                  <tr key={edge.id}>
                    <th scope="row">
                      {
                        graph.nodes.find((node) => node.id === edge.subjectId)
                          ?.label
                      }
                      <br />
                      <code>{edge.predicate}</code>
                      <br />
                      {
                        graph.nodes.find((node) => node.id === edge.objectId)
                          ?.label
                      }
                    </th>
                    <td>
                      {edge.inferenceType.replaceAll("_", " ")}
                      <br />
                      {edge.methodVersion}
                      <br />
                      Recorded: {dateTime(edge.recordedAt)}
                      <br />
                      Time precision: {edge.timePrecision.replaceAll("_", " ")}
                    </td>
                    <td>
                      {edge.reasonCodes.join(", ").replaceAll("_", " ")}
                      <br />
                      Independence: {edge.independence}
                      <br />
                      {edge.relationStatus.replaceAll("_", " ")}
                    </td>
                    <td>{edge.sourceFamilyId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="ce-card">
        <h2>What police publication leaves out</h2>
        <p>
          Public crime data is a limited publication. Missing details do not
          mean police do not collect or need them.
        </p>
        <p>
          Investigation methods depend on the case. This record does not
          disclose interviews, CCTV, forensic evidence, or witness accounts.
        </p>
        <div className="ce-source-links">
          {reportingSources.sources
            .filter((source) => source.id.startsWith("police-"))
            .map((source) => (
              <article key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <p className="ce-note">{source.summary}</p>
              </article>
            ))}
        </div>
      </section>
      <footer>
        Contains public sector information licensed under the Open Government
        Licence v3.0. Fictional accounts are separate demonstration content.
      </footer>
    </main>
  );
}
