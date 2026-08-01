import { useEffect } from "react";
import { ExecutionWorkspace as LegacyExecutionWorkspace } from "./ExecutionWorkspaceLegacy";
import { ProjectActivityRealization } from "./ProjectActivityRealization";
import "./project-activity-realization.css";
import "./restore-activity-modes.css";
import "./project-detail-layout.css";
import "./project-detail-full-width.css";
import "./project-detail-right-column.css";
import "./project-detail-compact-right.css";
import "./project-detail-no-stretch.css";
import "./project-detail-independent-columns.css";
import "./project-detail-right-tight.css";
import "./project-detail-right-15.css";
import "./project-detail-right-20.css";
import "./project-detail-right-32.css";
import "./project-detail-align-activities.css";
import "./project-detail-right-30.css";
import "./project-detail-right-25-align.css";
import "./project-detail-grid-aligned.css";
import "./project-detail-right-stack.css";
import "./project-detail-right-no-overlap.css";
import "./project-detail-screenshot-align.css";
import "./project-detail-final-align.css";
import "./project-detail-column-gap.css";
import "./project-detail-create-like.css";

const ACTIVITY_VIEW_KEY = "palemo-activity-view-mode";
const ACTIVITY_MODES = ["calendar", "tree", "kanban"] as const;
type ActivityMode = (typeof ACTIVITY_MODES)[number];

function ActivityViewPreferenceBridge() {
  useEffect(() => {
    const activateStoredMode = () => {
      const stored = window.localStorage.getItem(ACTIVITY_VIEW_KEY);
      if (!stored || !ACTIVITY_MODES.includes(stored as ActivityMode)) return;
      document.querySelectorAll<HTMLElement>(".activity-mode-switch").forEach(switcher => {
        const button = Array.from(switcher.querySelectorAll<HTMLButtonElement>("button")).find(candidate =>
          candidate.getAttribute("aria-label")?.toLowerCase().includes(stored) || candidate.textContent?.toLowerCase().includes(stored),
        );
        if (button && !button.classList.contains("active")) button.click();
      });
    };
    const rememberMode = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".activity-mode-switch button");
      if (!button) return;
      const value = ACTIVITY_MODES.find(mode => button.textContent?.toLowerCase().includes(mode));
      if (value) window.localStorage.setItem(ACTIVITY_VIEW_KEY, value);
    };
    const observer = new MutationObserver(activateStoredMode);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", rememberMode, true);
    activateStoredMode();
    return () => { observer.disconnect(); document.removeEventListener("click", rememberMode, true); };
  }, []);
  return null;
}

type Props = { teamID: string; projectID?: string; onBack?: () => void; onEdit?: () => void };

export function ExecutionWorkspace(props: Props) {
  return <div className="project-detail-shell">
    <ActivityViewPreferenceBridge />
    <LegacyExecutionWorkspace {...props} />
    {props.projectID && <ProjectActivityRealization projectID={props.projectID} />}
  </div>;
}
