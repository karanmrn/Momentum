import type { PilotId } from "../packages/contracts";
import "./WorkflowLinks.css";
export function WorkflowLinks({
  area,
  includeGraph = true,
}: {
  area: PilotId;
  includeGraph?: boolean;
}) {
  return (
    <nav className="workflow-links" aria-label="Community tools">
      {[
        ...(includeGraph ? [["graph", "Graph view"]] : []),
        ["community", "Report and review"],
        ["preferences", "Personal preferences"],
        ["relations", "Relation review"],
        ["analysis", "Research comparisons"],
      ].map(([id, label]) => (
        <a
          key={id}
          className="button secondary"
          href={`/?demo=1&workspace=${id}&area=${area}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
