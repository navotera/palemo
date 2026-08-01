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

type Props = { teamID: string; projectID?: string; onBack?: () => void; onEdit?: () => void };

export function ExecutionWorkspace(props: Props) {
  return <div className="project-detail-shell">
    <LegacyExecutionWorkspace {...props} />
    {props.projectID && <ProjectActivityRealization projectID={props.projectID} />}
  </div>;
}
