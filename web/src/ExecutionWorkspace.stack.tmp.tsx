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

type Props = { teamID: string; projectID?: string; onBack?: () => void; onEdit?: () => void };

export function ExecutionWorkspace(props: Props) {
  return <div className="project-detail-shell">
    <LegacyExecutionWorkspace {...props} />
    {props.projectID && <ProjectActivityRealization projectID={props.projectID} />}
  </div>;
}
