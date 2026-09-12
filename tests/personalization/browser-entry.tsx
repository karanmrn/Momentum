import { createRoot } from "react-dom/client";
import { PersonalizationWorkspace } from "../../src/PersonalizationWorkspace";
import "../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <PersonalizationWorkspace
    onExit={() => {
      location.href = "/";
    }}
  />,
);
