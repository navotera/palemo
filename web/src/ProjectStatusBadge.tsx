const statusLabels: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  review: "On review",
  done: "Completed",
  archived: "Archived",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.trim().toLowerCase();
  const label =
    statusLabels[normalizedStatus] ??
    normalizedStatus.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());

  return (
    <span className="project-status-badge" data-status={normalizedStatus}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
