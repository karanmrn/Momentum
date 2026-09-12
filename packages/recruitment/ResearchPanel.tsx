import { useState, type FormEvent } from "react";
import { areas, type Persona, type PilotId } from "../contracts";
import {
  createRecruitmentDemo,
  listRecruitmentDirectory,
  landmarkOptions,
  submitResearchObservation,
  withdrawResearchObservation,
  observationsForOwner,
  compareResearchCoverage,
  comfortFactors,
  behaviors,
  timeWindows,
  RecruitmentError,
} from "./index";

const words = (value: string) => value.replaceAll("_", " ");

export function ResearchPanel({
  actor,
  pilotId,
}: {
  actor: Persona;
  pilotId: PilotId;
}) {
  const [state, setState] = useState(createRecruitmentDemo);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const now = new Date().toISOString();
  const entries = listRecruitmentDirectory(pilotId, now);
  const own = actor === "moderator" ? [] : observationsForOwner(state, actor);
  const coverage = compareResearchCoverage(state, now);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const next = submitResearchObservation(
        state,
        actor,
        {
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
          idempotencyKey: crypto.randomUUID(),
        },
        { id: crypto.randomUUID(), now: new Date().toISOString() },
      );
      setState(next);
      setError("");
      setMessage("Fictional observation saved in this view.");
      form.reset();
    } catch (failure) {
      setError(
        failure instanceof RecruitmentError
          ? failure.message
          : "Select a comfort factor, a valid date, and confirm fictional participation.",
      );
      setMessage("");
    }
  }

  return (
    <section aria-labelledby="research-heading">
      <div className="page-heading">
        <h1 id="research-heading">Community research</h1>
        <span className="tag orange">Fictional exercise</span>
      </div>
      <p className="synthetic">
        Temporary exercise. Leaving this view, changing persona, or reloading
        clears all research observations.
      </p>
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
          <form key={pilotId} className="form-grid" onSubmit={submit}>
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
            <button className="button" type="submit">
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
                    Aggregate consent: {item.consent.aggregate ? "yes" : "no"} ·{" "}
                    {item.consent.version}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      try {
                        setState(
                          withdrawResearchObservation(
                            state,
                            actor,
                            { id: item.id, expectedRevision: item.revision },
                            new Date().toISOString(),
                          ),
                        );
                        setError("");
                        setMessage(
                          "Observation withdrawn. Its content is removed from this exercise.",
                        );
                      } catch {
                        setError(
                          "The observation changed. Check its current revision.",
                        );
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
