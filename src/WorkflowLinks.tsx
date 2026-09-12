import type { PilotId } from "../packages/contracts";
import "./WorkflowLinks.css";
export function WorkflowLinks({ area }: { area: PilotId }) {
  return (
    <nav className="workflow-links" aria-label="Community tools">
      {[
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
