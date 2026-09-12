import { useEffect, useRef, useState, type FormEvent } from "react";
import { areas, type Persona, type PilotId } from "../contracts";
import {
  listRecruitmentDirectory,
  landmarkOptions,
  comfortFactors,
  behaviors,
  timeWindows,
  researchPolicy,
  researchSnapshotSchema,
  type ResearchObservation,
  type CoverageComparison,
} from "./index";

const words = (value: string) => value.replaceAll("_", " ");

export function ResearchPanel({
  actor,
  pilotId,
}: {
  actor: Persona;
  pilotId: PilotId;
}) {
  const [own, setOwn] = useState<ResearchObservation[]>([]);
  const [coverage, setCoverage] = useState<CoverageComparison[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const pendingKey = useRef<string | null>(null);
  async function request(path = "", body?: unknown) {
    const response = await fetch(`/api/research-consent${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        payload.error?.message ?? "Research storage is unavailable.",
      );
    if (payload.synthetic !== true)
      throw new Error("Research storage returned invalid data.");
    return researchSnapshotSchema.parse(payload.data);
  }
  async function load() {
    const current = ++generation.current;
    setReady(false);
    setOwn([]);
    setCoverage([]);
    setError("");
    setMessage("");
    pendingKey.current = null;
    if (actor === "moderator") {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const data = await request();
      if (current !== generation.current) return;
      setOwn(data.observations);
      setCoverage(data.coverage);
      setReady(true);
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Research storage is unavailable.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [actor]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const now = new Date().toISOString();
  const entries = listRecruitmentDirectory(pilotId, now);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!ready || busy) return;
    const current = generation.current;
    setBusy(true);
    try {
      pendingKey.current ??= crypto.randomUUID();
      const next = await request("/observations", {
        pilotId,
        landmarkId: String(data.get("landmarkId")),
        observedDate: String(data.get("observedDate")),
        recruitmentEntryId: String(data.get("recruitmentEntryId")),
        comfortFactors: data.getAll("comfortFactors"),
        behavior: String(data.get("behavior")),
        timeWindow: String(data.get("timeWindow")),
        fictional: data.get("fictional") === "on",
        consent: {
          version: "research-demo-v1",
          participation: data.get("participation") === "on",
          aggregate: data.get("aggregate") === "on",
        },
        idempotencyKey: pendingKey.current,
      });
      if (current !== generation.current) return;
      setOwn(next.observations);
      setCoverage(next.coverage);
      pendingKey.current = null;
      setError("");
      setMessage("Fictional observation saved for this private demo session.");
      form.reset();
    } catch (failure) {
      if (current !== generation.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Select a comfort factor, a valid date, and confirm fictional participation.",
      );
      setMessage("");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  return (
    <section aria-labelledby="research-heading">
      <div className="page-heading">
        <h1 id="research-heading">Community research</h1>
        <span className="tag orange">Fictional exercise</span>
      </div>
      <p className="synthetic">
        Fictional answers are available in this private demo session for up to
        24 hours. Withdrawal removes answers and excludes them from coverage.
      </p>
      <p>
        {researchPolicy.purpose} Consent version: {researchPolicy.version}.
      </p>
      {busy && <p role="status">Loading research...</p>}
      {!ready && actor !== "moderator" && !busy && (
        <button className="button secondary" onClick={() => void load()}>
          Retry research storage
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section
        className="panel feed-panel section"
        aria-labelledby="directory-heading"
      >
        <h2 id="directory-heading">Recruitment directory</h2>
        <p>
          Fictional networks illustrate access methods. No real group access or
          endorsement is confirmed.
        </p>
        <div className="stack">
          {entries.map((entry) => (
            <article className="source" key={entry.id}>
              <h3>{entry.label}</h3>
              <div className="tag-row">
                <span className="tag orange">Fictional</span>
                <span className="tag">{words(entry.accessKind)}</span>
                <span className="tag">Access unverified</span>
              </div>
              <p>{entry.eligibility}</p>
              <p>
                {entry.locality} · {words(entry.freshness)}
              </p>
              <p>
                Fixture date: {entry.checkedAt.slice(0, 10)}. Permission not
                requested.
              </p>
              <p>
                {entry.accessKind === "channel"
                  ? "Broadcast updates are not member observations."
                  : entry.accessKind === "gateway"
                    ? "A gateway does not confirm a WhatsApp group exists."
                    : entry.accessKind === "legacy"
                      ? "Past access does not establish current activity."
                      : "Administrator permission is required before recruitment."}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section
        className="panel feed-panel section"
        aria-labelledby="observation-heading"
      >
        <h2 id="observation-heading">Add a fictional observation</h2>
        {actor === "moderator" ? (
          <p>Select Alex or Sam to try the fictional form.</p>
        ) : (
          <form
            key={pilotId}
            className="form-grid"
            onSubmit={submit}
            onChange={() => {
              pendingKey.current = null;
            }}
          >
            <label>
              Recruitment source
              <select name="recruitmentEntryId">
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Approximate landmark
              <select name="landmarkId">
                {landmarkOptions[pilotId].map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observation date
              <input
                type="date"
                name="observedDate"
                required
                max={now.slice(0, 10)}
                defaultValue={now.slice(0, 10)}
              />
            </label>
            <label>
              Time window
              <select name="timeWindow">
                {timeWindows.map((value) => (
                  <option key={value} value={value}>
                    {words(value)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Comfort factors</legend>
              <div className="check-grid">
                {comfortFactors.map((factor) => (
                  <label className="check" key={factor}>
                    <input
                      type="checkbox"
                      name="comfortFactors"
                      value={factor}
                    />
                    {words(factor)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Resulting behavior
              <select name="behavior">
                {behaviors.map((value) => (
                  <option key={value} value={value}>
                    {words(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="fictional" required />
              This observation is fictional.
            </label>
            <label className="check">
              <input type="checkbox" name="participation" required />I agree to
              this temporary research exercise.
            </label>
            <label className="check">
              <input type="checkbox" name="aggregate" />
              Include this observation in fictional aggregate coverage.
            </label>
            <button className="button" type="submit" disabled={!ready || busy}>
              Save fictional observation
            </button>
          </form>
        )}
      </section>
      <section
        className="panel feed-panel section"
        aria-labelledby="own-research-heading"
      >
        <h2 id="own-research-heading">My research observations</h2>
        {!own.length && <p>No observations in this exercise.</p>}
        <div className="stack">
          {own.map((item) => (
            <article className="report" key={item.id}>
              <h3>
                {item.status === "withdrawn"
                  ? "Withdrawn observation"
                  : "Fictional observation"}
              </h3>
              <span className="tag">{item.status}</span>
              {item.status === "active" && (
                <>
                  <p>
                    {areas.find((area) => area.id === item.pilotId)?.name} ·{" "}
                    {
                      landmarkOptions[item.pilotId].find(
                        (place) => place.id === item.landmarkId,
                      )?.label
                    }
                  </p>
                  <p>
                    {item.observedDate} · {words(item.timeWindow)} ·{" "}
                    {words(item.behavior)}
                  </p>
                  <p>{item.comfortFactors.map(words).join(", ")}</p>
                  <p>
                    Access expires: {new Date(item.expiresAt).toLocaleString()}
                  </p>
                  <p>
                    Aggregate consent: {item.consent.aggregate ? "yes" : "no"} ·{" "}
                    {item.consent.version}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy || !ready}
                    onClick={async () => {
                      const current = generation.current;
                      setBusy(true);
                      try {
                        const next = await request("/withdraw", {
                          id: item.id,
                          expectedRevision: item.revision,
                        });
                        if (current !== generation.current) return;
                        setOwn(next.observations);
                        setCoverage(next.coverage);
                        setError("");
                        setMessage(
                          "Observation withdrawn. Its content is removed from this exercise.",
                        );
                      } catch (failure) {
                        if (current === generation.current)
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "Withdrawal failed. Try again.",
                          );
                      } finally {
                        if (current === generation.current) setBusy(false);
                      }
                    }}
                  >
                    Withdraw observation
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
      <section
        className="panel feed-panel section"
        aria-labelledby="coverage-heading"
      >
        <h2 id="coverage-heading">Area evidence coverage</h2>
        <p>
          Fictional coverage cannot test claims about crime, causes, or personal
          danger.
        </p>
        <div className="stack">
          {coverage.map((item) => (
            <article className="source" key={item.pilotId}>
              <h3>{areas.find((area) => area.id === item.pilotId)?.name}</h3>
              <p>
                {item.count === null
                  ? "Small cohort. Count withheld."
                  : `${item.count} eligible fictional observations`}
              </p>
              <span className="tag">Insufficient comparable data</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
