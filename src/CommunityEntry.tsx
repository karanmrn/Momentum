import { useEffect, useState } from "react";
import {
  areas,
  personaSchema,
  type Persona,
  type PilotId,
} from "../packages/contracts";
import { CommunityWorkspace } from "./CommunityWorkspace";
import { WorkflowLinks } from "./WorkflowLinks";
export function CommunityEntry({
  initialArea,
  onExit,
}: {
  initialArea: PilotId;
  onExit: () => void;
}) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [area, setArea] = useState(initialArea);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function session(next?: Persona) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/session",
        next
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ persona: next }),
            }
          : undefined,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "The demo session could not load.",
        );
      setPersona(personaSchema.parse(body.data.persona));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void session();
  }, []);
  return (
    <>
      <div className="workflow-entry-controls">
        <label>
          Demo persona
          <select
            value={persona ?? "alex"}
            disabled={busy}
            onChange={(e) => void session(e.target.value as Persona)}
          >
            <option value="alex">Alex</option>
            <option value="sam">Sam</option>
            <option value="moderator">Moderator</option>
          </select>
        </label>
        <label>
          Pilot area
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
      </div>
      <WorkflowLinks area={area} />
      {error && <p role="alert">{error}</p>}
      {busy ? (
        <p role="status">Loading fictional workspace...</p>
      ) : persona ? (
        <CommunityWorkspace
          key={`${persona}:${area}`}
          persona={persona}
          pilotId={area}
          onExit={onExit}
        />
      ) : (
        <button className="button" onClick={() => void session()}>
          Retry demo session
        </button>
      )}
    </>
  );
}
