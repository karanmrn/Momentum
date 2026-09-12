import { useEffect, useMemo, useState } from "react";
import { type PilotId } from "../packages/contracts/index.js";
import {
  getUniformEnrichment,
  placeIdentity,
  policeOutcomeHistory,
  sourceReuse,
} from "../packages/enrichment/index.js";
import { sourceDiversity } from "../packages/enrichment/uniform.js";
import {
  createFictionalObservation,
  projectCommunityMetadata,
  reviseFictionalObservation,
  withdrawFictionalObservation,
} from "../packages/enrichment/community.js";
import { onsGeographySchema } from "../packages/enrichment/ons-geography.js";
import { mpsContextSchema } from "../packages/enrichment/mps-context.js";
import onsSnapshot from "../research/enrichment/ons-geography.json";
import mpsSnapshot from "../research/enrichment/mps-context.json";
import "./enrichment-context.css";
import { getCamdenHelpCacheTtl } from "../services/data/camden-help.js";

const ons = onsGeographySchema.parse(onsSnapshot);
const mps = mpsContextSchema.parse(mpsSnapshot);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

export function EnrichmentContext({
  initialPilot = "camden_town",
  onExit,
}: { initialPilot?: PilotId; onExit?: () => void } = {}) {
  const [pilot, setPilot] = useState<PilotId>(initialPilot);
  const [caseId, setCaseId] = useState("CAM-02");
  const [month, setMonth] = useState(mps.months.at(-1)!);
  const [account, setAccount] = useState(createFictionalObservation);
  const [tab, setTab] = useState<"context" | "community" | "sources">(
    "context",
  );
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(
      () => setClock(new Date()),
      getCamdenHelpCacheTtl(clock),
    );
    return () => clearTimeout(timer);
  }, [clock]);
  const records = useMemo(
    () => getUniformEnrichment(pilot, clock),
    [pilot, clock],
  );
  const diversity = sourceDiversity(records);
  const history = policeOutcomeHistory.results.find(
    (row) => row.expectedCrime.exampleId === caseId,
  )!;
  const population = ons.observations.filter((row) => row.pilotId === pilot);
  const cells = mps.cells.filter(
    (row) =>
      row.borough === placeIdentity[pilot].borough && row.month === month,
  );
  const projection = projectCommunityMetadata(account);
  const withdrawn = account.metadata.reviewStatus === "withdrawn";
  function changePilot(next: PilotId) {
    setPilot(next);
    const url = new URL(window.location.href);
    url.searchParams.set("area", next);
    window.history.replaceState(null, "", url.href);
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: "1.0",
            scope: "historical_context_metadata",
            pilotId: pilot,
            records: getUniformEnrichment(pilot, new Date()),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `streetwise-${pilot}-enrichment.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="enrichment">
      <header className="en-heading">
        <div>
          <span className="en-kicker">Momentum · Data context</span>
          <h1>Connect the evidence</h1>
        </div>
        {onExit && <button onClick={onExit}>Back to Momentum</button>}
      </header>
      <div className="en-controls">
        <label>
          Area
          <select
            value={pilot}
            onChange={(event) => changePilot(event.target.value as PilotId)}
          >
            {Object.entries(placeIdentity).map(([id, area]) => (
              <option value={id} key={id}>
                {area.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={download}>Download source metadata</button>
      </div>
      <nav className="en-tabs" aria-label="Data context sections">
        {(["context", "community", "sources"] as const).map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item === "context"
              ? "Official context"
              : item === "community"
                ? "Community detail"
                : "Sources and joins"}
          </button>
        ))}
      </nav>
      <div className="en-notice">
        <strong>Historical context and a separate fictional exercise.</strong>
        <p>
          These records do not show current danger or confirm that two reports
          describe the same event.
        </p>
      </div>
      {tab === "context" && (
        <>
          <section className="en-card">
            <div className="en-section-head">
              <h2>Police outcome history</h2>
              {pilot === "camden_town" && (
                <label>
                  Record
                  <select
                    value={caseId}
                    onChange={(event) => setCaseId(event.target.value)}
                  >
                    {policeOutcomeHistory.results.map((r) => (
                      <option key={r.expectedCrime.exampleId}>
                        {r.expectedCrime.exampleId}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {pilot !== "camden_town" ? (
              <p>
                No exact-record outcome sample has been collected for this area.
              </p>
            ) : (
              <>
                <p>
                  Matched by the public persistent ID, category, and recorded
                  month. Exact incident date and assault subtype remain unknown.
                </p>
                <ol className="en-timeline">
                  {history.status === "available" ? (
                    history.outcomes.map((outcome) => (
                      <li key={outcome.id}>
                        <strong>
                          {outcome.categoryName ?? "Outcome not supplied"}
                        </strong>
                        <span>{outcome.month ?? "Month unknown"}</span>
                      </li>
                    ))
                  ) : (
                    <li>Source unavailable. No history is inferred.</li>
                  )}
                </ol>
                <p className="en-limit">
                  The source can publish several outcomes in one month. Their
                  order does not establish exact transition dates.
                </p>
                <a href={history.sourceUrl} target="_blank" rel="noreferrer">
                  Open Police.uk source
                </a>
                <small>Collected {date(history.fetchedAt)} London time</small>
              </>
            )}
          </section>
          <section className="en-card">
            <h2>Census area context</h2>
            <div className="en-grid">
              {population.map((row) => (
                <article className="en-stat" key={row.level}>
                  <span className="en-kicker">{row.level} · 2021 boundary</span>
                  <h3>
                    {row.containingArea?.name ?? row.selectedPostcodeArea.name}
                  </h3>
                  {row.population.status === "available" ? (
                    <>
                      <strong className="en-number">
                        {row.population.usualResidents!.toLocaleString("en-GB")}
                      </strong>
                      <span>Usual residents · 21 March 2021</span>
                      <p>Research anchor lies inside this area.</p>
                    </>
                  ) : (
                    <>
                      <strong>Population not assigned</strong>
                      <p>
                        {row.status === "boundary_ambiguous"
                          ? "The anchor is too close to a boundary for a confident area assignment."
                          : "Area or population evidence is unavailable."}
                      </p>
                    </>
                  )}
                  <code>
                    {row.containingArea?.code ?? row.selectedPostcodeArea.code}
                  </code>
                  <small>
                    {row.status === "boundary_ambiguous"
                      ? "Selected postcode area only"
                      : label(row.status)}
                  </small>
                  {row.boundaryEvidence[0] && (
                    <a
                      href={row.boundaryEvidence[0].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Boundary source
                    </a>
                  )}
                  {row.population.evidence && (
                    <a
                      href={row.population.evidence.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Population source
                    </a>
                  )}
                </article>
              ))}
            </div>
            <p className="en-limit">
              LSOA and MSOA areas overlap. Do not add their populations. These
              counts exclude visitors and are not town-centre totals.
            </p>
          </section>
          <section className="en-card">
            <div className="en-section-head">
              <h2>{placeIdentity[pilot].borough} borough crime context</h2>
              <label>
                Recorded month
                <select
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                >
                  {[...mps.months].reverse().map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              These MPS figures cover the whole borough. They cannot classify
              the five police records or measure {placeIdentity[pilot].label}{" "}
              alone.
            </p>
            <div className="en-table-wrap">
              <table>
                <caption>Published MPS categories · {month}</caption>
                <thead>
                  <tr>
                    <th scope="col">Major category</th>
                    <th scope="col">Minor category</th>
                    <th scope="col">Recorded count</th>
                  </tr>
                </thead>
                <tbody>
                  {cells.map((row) => (
                    <tr key={row.id}>
                      <td>{label(row.majorCategory)}</td>
                      <td>{label(row.minorCategory)}</td>
                      <td>
                        {row.count === null
                          ? "Not supplied"
                          : row.count.toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="en-limit">
              Keep these figures separate from Police.uk counts. Sexual-offence
              detail is withheld at LSOA level.
            </p>
            <p className="en-limit">
              The MPS recording system changed after February 2024. Comparisons
              with earlier data need care.
            </p>
            <a href={mps.source.catalogueUrl} target="_blank" rel="noreferrer">
              MPS source and licence
            </a>
            <small>Downloaded {date(mps.source.fetchedAt)} London time</small>
          </section>
        </>
      )}
      {tab === "community" && (
        <section className="en-card en-fiction">
          <span className="en-kicker">Fictional exercise · Camden Town</span>
          <h2>What a community account can add</h2>
          <p>
            Exact times and participant roles can matter to police. Their
            absence from public data does not mean police ignore them.
          </p>
          <div className="en-state" role="status">
            {withdrawn
              ? "Fictional account withdrawn. Its graph projection is removed."
              : `Revision ${account.metadata.revision} · ${label(account.metadata.reviewStatus)}`}
          </div>
          {!withdrawn && (
            <>
              <dl className="en-fields">
                <div>
                  <dt>Account basis</dt>
                  <dd>{label(account.accountBasis)}</dd>
                </div>
                <div>
                  <dt>Observed interval</dt>
                  <dd>
                    {account.observedTime.precision === "interval"
                      ? `${date(account.observedTime.start)} to ${date(account.observedTime.end)} · ±${account.observedTime.uncertaintyMinutes} minutes`
                      : "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{date(account.submittedAt)}</dd>
                </div>
                <div>
                  <dt>Behaviour described</dt>
                  <dd>{label(account.behaviour)}</dd>
                </div>
                <div>
                  <dt>Participant roles</dt>
                  <dd>{account.roles.map(label).join(", ")}</dd>
                </div>
                <div>
                  <dt>Evidence offered</dt>
                  <dd>Video offered · not obtained · not reviewed</dd>
                </div>
                <div>
                  <dt>Consent</dt>
                  <dd>Private review only. No public summary consent.</dd>
                </div>
                <div>
                  <dt>Legal classification</dt>
                  <dd>Not determined. No police match established.</dd>
                </div>
              </dl>
              <div className="en-controls">
                <button
                  onClick={() =>
                    setAccount(
                      reviseFictionalObservation(account, {
                        precision: "interval",
                        start: "2026-09-10T20:50:00+01:00",
                        end: "2026-09-10T21:00:00+01:00",
                        uncertaintyMinutes: 10,
                      }),
                    )
                  }
                >
                  Correct fictional time
                </button>
                <button
                  onClick={() =>
                    setAccount(withdrawFictionalObservation(account))
                  }
                >
                  Withdraw fictional account
                </button>
              </div>
            </>
          )}
          <button onClick={() => setAccount(createFictionalObservation())}>
            Reset fictional exercise
          </button>
          <details>
            <summary>Current fictional graph metadata</summary>
            <pre>{JSON.stringify(projection, null, 2)}</pre>
          </details>
          <p className="en-limit">
            This exercise stays in memory. Genuine intake still needs consenting
            participants and a named review team.
          </p>
        </section>
      )}
      {tab === "sources" && (
        <>
          <section className="en-card">
            <h2>One format, distinct source claims</h2>
            <div
              className="en-flow"
              aria-label="Source snapshots connect to qualified records, which connect to places and area context"
            >
              <span>Source snapshot</span>
              <b aria-hidden="true">→</b>
              <span>Qualified record</span>
              <b aria-hidden="true">→</b>
              <span>Place or area context</span>
            </div>
            <p>
              {records.length} metadata records · {diversity.sourceFamilies}{" "}
              source families · {diversity.unknownOrigins} records with unknown
              claim origin
            </p>
            <p>
              A source family is not an independent witness. Nearby records are
              not automatically the same event.
            </p>
            <details>
              <summary>Inspect uniform fields</summary>
              <div className="en-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>Source family</th>
                      <th>Place precision</th>
                      <th>Time precision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {label(r.recordKind)}
                          <code>{r.sourceRecordId}</code>
                        </td>
                        <td>{r.sourceFamilyId}</td>
                        <td>{label(r.geography.precision)}</td>
                        <td>{r.observedTime.precision}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="en-card">
            <h2>Reuse across sources and repositories</h2>
            <div className="en-source-grid">
              {sourceReuse.map((source) => (
                <article key={source.name}>
                  <h3>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                    </a>
                  </h3>
                  <strong>{source.role}</strong>
                  <p>{source.status}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <footer className="en-footer">
        <a href="/?evidence=camden&area=camden_town">
          Open the five Camden examples
        </a>
        <span>
          Source labels, unknowns, and corrections stay with each record.
        </span>
      </footer>
    </main>
  );
}
