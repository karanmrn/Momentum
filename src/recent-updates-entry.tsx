import { createRoot } from "react-dom/client";
import { RecentUpdates } from "./RecentUpdates";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <RecentUpdates
    onExit={() => {
      window.location.href = "/";
    }}
  />,
);
