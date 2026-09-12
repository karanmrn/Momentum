import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommunityWorkspace } from "../../src/CommunityWorkspace";
import type { Persona } from "../../packages/contracts";
function Harness() {
  const [persona, setPersona] = useState<Persona | null>(null);
  useEffect(() => {
    void fetch("/api/session")
      .then((r) => r.json())
      .then((value) => setPersona(value.persona));
  }, []);
  return (
    <>
      {persona && (
        <>
          <label style={{ display: "block", padding: 16 }}>
            Test persona
            <select
              aria-label="Test persona"
              style={{ minHeight: 48 }}
              value={persona}
              onChange={(event) => {
                void fetch("/api/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ persona: event.target.value }),
                })
                  .then((r) => r.json())
                  .then((value) => setPersona(value.persona));
              }}
            >
              <option value="alex">Alex</option>
              <option value="sam">Sam</option>
              <option value="moderator">Moderator</option>
            </select>
          </label>
          <CommunityWorkspace persona={persona} pilotId="camden_town" />
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
