import { useState } from "react";
import fixtures from "../packages/community-demo/fixtures.json";
import type { PilotId } from "../packages/contracts";

export interface ScenarioDraft {
  title: string;
  description: string;
  place: string;
  observedAt: string;
  category: "infrastructure" | "community";
}

export function ScenarioPicker({
  areaId,
  disabled,
  onUse,
}: {
  areaId: PilotId;
  disabled: boolean;
  onUse: (draft: ScenarioDraft) => void;
}) {
  const [selected, setSelected] = useState("");
  const [applied, setApplied] = useState(false);
  const scenarios = fixtures.scenarios.filter(
    (scenario) =>
      scenario.pilotId === areaId &&
      scenario.publication === "reviewable" &&
      scenario.synthetic === true &&
      scenario.topic !== "sexual_violence",
  );
  const scenario = scenarios.find((item) => item.id === selected);
  return (
    <fieldset
      disabled={disabled}
      style={{
        minWidth: 0,
        margin: 0,
        padding: "12px",
        border: "1px solid #d5d8ca",
      }}
    >
      <legend>Fictional scenario (optional)</legend>
      <label style={{ minWidth: 0 }}>
        Scenario for this area
        <select
          style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setApplied(false);
          }}
        >
          <option value="">Choose a scenario</option>
          {scenarios.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <p className="subtle">
        Use a scenario to replace the fields below. Review it before saving.
      </p>
      <button
        className="button secondary"
        type="button"
        disabled={!scenario}
        onClick={() => {
          if (!scenario) return;
          onUse({
            title: scenario.title,
            description: scenario.description,
            place: scenario.place,
            observedAt: scenario.observedAt,
            category:
              scenario.topic === "environment" ? "infrastructure" : "community",
          });
          setApplied(true);
        }}
      >
        Use scenario
      </button>
      {applied && (
        <p role="status">
          Fictional fields filled. Nothing has been submitted.
        </p>
      )}
    </fieldset>
  );
}
