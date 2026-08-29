import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./execution.css";
import { FinishProofs } from "./FinishProofs";
import { ActivityCalendar, type PlannedActivity } from "./ActivityCalendar";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

type Project = {
  id: string;
  display_number?: number | null;
  name: string;
  status: string;
  updated_at?: string;
  parent_project_id?: string | null;
  project_type?: string;
  metadata?: Record<string, unknown>;
  reviewer_ids?: string[];
  created_by?: string;
  created_by_name?: string | null;
};

type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  board_column: "todo" | "in_progress" | "review" | "done";
  position: number;
  due_date?: string | null;
  created_at: string;
};

type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };
type DirectoryUser = { id: string; name: string; email?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Envelope<T>)
    : null;
  if (!response.ok) {
    throw new Error(
      body?.errors?.[0]?.message ?? `Request failed (${response.status})`,
    );
  }
  if (!body) throw new Error("Server returned an invalid response");
  return body.data;
}

export function ExecutionWorkspace({
  teamID: _,
  projectID,
  onBack,
  onEdit,
  onOpenProject,
  onCreateKnowledge,
}: {
  teamID: string;
  projectID?: string;
  onBack?: () => void;
  onEdit?: () => void;
  onOpenProject?: (projectID: string) => void;
  onCreateKnowledge?: (projectID: string) => void;
}) {
  const queryClient = useQueryClient();
  const selected = projectID ?? "";
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/api/v1/projects"),
  });
  const current = projects.data?.find((project) => project.id === selected);
  const parentProject = useMemo(
    () => current?.parent_project_id
      ? (projects.data ?? []).find((project) => project.id === current.parent_project_id)
      : undefined,
    [current?.parent_project_id, projects.data],
  );
  const childProjects = useMemo(
    () => (projects.data ?? []).filter((project) => project.parent_project_id === selected),
    [projects.data, selected],
  );
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<DirectoryUser[]>("/api/v1/users"),
    enabled: !!selected,
  });
  const reviewers = useMemo(() => {
    const reviewerIDs = new Set(current?.reviewer_ids ?? []);
    return (users.data ?? []).filter((user) => reviewerIDs.has(user.id));
  }, [current?.reviewer_ids, users.data]);
  const tasks = useQuery({
    queryKey: ["tasks", selected],
    queryFn: () => api<Task[]>(`/api/v1/tasks?project_id=${selected}`),
    enabled: !!selected,
  });
  const fromTasks = useMemo<PlannedActivity[]>(
    () =>
      [...(tasks.data ?? [])].map((task) => ({
        id: task.id,
        date: task.due_date ?? task.created_at.slice(0, 10),
        title: task.title,
        description: task.description || task.title,
        boardColumn: task.board_column,
      })),
    [tasks.data],
  );
  const [activities, setActivities] = useState<PlannedActivity[]>([]);
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  useEffect(() => setActivities(fromTasks), [fromTasks]);
  useEffect(() => setConfirmingFinish(false), [selected]);

  const finishDate =
    typeof current?.metadata?.finish_date === "string"
      ? current.metadata.finish_date
      : "";
  const syncActivities = useMutation({
    mutationFn: async (next: PlannedActivity[]) => {
      const previous = new Map(
        (tasks.data ?? []).map((task) => [task.id, task]),
      );
      const nextIDs = new Set(next.map((item) => item.id));
      const requests: Promise<unknown>[] = [];
      for (const task of tasks.data ?? []) {
        if (!nextIDs.has(task.id)) {
          requests.push(api(`/api/v1/tasks/${task.id}`, { method: "DELETE" }));
        }
      }
      for (const [position, item] of next.entries()) {
        const existing = previous.get(item.id);
        if (!existing) {
          requests.push(
            api("/api/v1/tasks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: JSON.stringify({
                project_id: selected,
                title: item.title,
                description: item.description,
                due_date: item.date,
                board_column: item.boardColumn ?? "todo",
              }),
            }),
          );
        } else if (
          existing.title !== item.title ||
          existing.description !== item.description ||
          existing.due_date !== item.date ||
          existing.board_column !== (item.boardColumn ?? "todo") ||
          existing.position !== position
        ) {
          requests.push(
            api(`/api/v1/tasks/${item.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: item.title,
                description: item.description,
                due_date: item.date,
                board_column: item.boardColumn ?? "todo",
                position,
              }),
            }),
          );
        }
      }
      await Promise.all(requests);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", selected] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: () => setActivities(fromTasks),
  });

  function updateActivities(next: PlannedActivity[]) {
    setActivities(next);
    syncActivities.mutate(next);
  }

  const updateFinish = useMutation({
    mutationFn: (date: string) =>
      api<Project>(`/api/v1/projects/${selected}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { ...(current?.metadata ?? {}), finish_date: date },
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  const submitReview = useMutation({
    mutationFn: () =>
      api<Project>(`/api/v1/projects/${selected}/submit-review`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () => {
      setConfirmingFinish(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
  const reopen = useMutation({
    mutationFn: () =>
      api<Project>(`/api/v1/projects/${selected}/reopen`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
  const saveAsTemplate = useMutation({
    mutationFn: async () => {
      const name = window.prompt("Template name", current?.name ?? "Project template")?.trim();
      if (!name) throw new Error("Template name is required.");
      return api(`/api/v1/project-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ name, source_project_id: selected, project_type: current?.project_type ?? "operational", visibility: "tenant" }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-templates"] }),
  });

  return (
    <section className="execution-panel detail-board">
      <header className="execution-head">
        <div>
          <button className="back-button" onClick={onBack}>
            ← Back to project summary
          </button>
          <h1>{current?.name ?? "Project activities"}</h1>
          {parentProject && (
            <p className="parent-project-context">
              Parent Project: {" "}
              <button
                type="button"
                onClick={() => onOpenProject?.(parentProject.id)}
              >
                {parentProject.name}
              </button>
            </p>
          )}
          {current && childProjects.length > 0 && (
              <button
                type="button"
                className="child-projects-link"
                onClick={() => document.getElementById("child-projects-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {childProjects.length} sub project{childProjects.length === 1 ? "" : "s"}
              </button>
          )}
        </div>
        {current && (
          <div className="project-detail-actions">
            <span className="project-detail-id">
              {current.display_number != null
                ? `#${String(current.display_number).padStart(2, "0")}`
                : `ID ${current.id.slice(0, 8)}`}
            </span>
            <ProjectStatusBadge status={current.status} />
            <button
              type="button"
              className="edit-project-button"
              onClick={onEdit}
            >
              Edit
            </button>
            {current.status === "done" && (
              <button type="button" className="edit-project-button" disabled={saveAsTemplate.isPending} onClick={() => saveAsTemplate.mutate()}>
                {saveAsTemplate.isPending ? "Saving..." : "Save as template"}
              </button>
            )}
          </div>
        )}
      </header>
      {selected && (
        <>
          {!!childProjects.length && (
            <section id="child-projects-section" className="child-projects-panel" aria-labelledby="child-projects-title">
              <div className="child-projects-heading">
                <div>
                  <h2 id="child-projects-title">Sub projects</h2>
                </div>
                <small>{childProjects.length} sub project{childProjects.length === 1 ? "" : "s"}</small>
              </div>
              <div className="child-projects-table">
                <div className="child-project-row child-project-header">
                  <span>Project name</span>
                  <span>Last activity</span>
                  <span>Overdue date</span>
                  <span>Status</span>
                </div>
                {childProjects.map((project) => {
                  const complete = project.status === "done" || project.status === "archived";
                  const finishDate = typeof project.metadata?.finish_date === "string" ? project.metadata.finish_date : "";
                  const overdue = !complete && finishDate && new Date(`${finishDate}T23:59:59`).getTime() < Date.now();
                  return (
                    <button
                      type="button"
                      className="child-project-row child-project-item"
                      key={project.id}
                      onClick={() => onOpenProject?.(project.id)}
                      aria-label={`Open sub project ${project.name}`}
                    >
                      <strong>{project.display_number != null ? `#${String(project.display_number).padStart(2, "0")} ` : ""}{project.name}</strong>
                      <time dateTime={project.updated_at}>{project.updated_at ? new Date(project.updated_at).toLocaleDateString() : "—"}</time>
                      <time className={overdue ? "child-project-overdue" : ""} dateTime={overdue ? finishDate : undefined}>{overdue ? new Date(`${finishDate}T00:00:00`).toLocaleDateString() : "—"}</time>
                      <span className={`child-project-status ${complete ? "complete" : "incomplete"}`}>{complete ? "Complete" : "Not complete"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <aside className="project-detail-sidebar">
            <div className="project-review-gate">
              <div>
                <strong>Finish work and continue workflow</strong>
                <small>
                  Projects with reviewers move to On Review. Projects without
                  reviewers complete directly.
                </small>
              </div>
              <div className="project-reviewers" aria-label="Project reviewers">
                <span>Project reviewer</span>
                {users.isPending ? (
                  <small>Loading reviewer...</small>
                ) : reviewers.length ? (
                  <ul>
                    {reviewers.map((reviewer) => (
                      <li key={reviewer.id}>
                        <span aria-hidden="true">
                          {reviewer.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                        <div>
                          <strong>{reviewer.name}</strong>
                          {reviewer.email && <small>{reviewer.email}</small>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small>
                    {users.isError
                      ? "Reviewer information unavailable"
                      : "No reviewer assigned"}
                  </small>
                )}
              </div>
              <button
                type="button"
                className="project-create-knowledge"
                onClick={() => onCreateKnowledge?.(selected)}
              >
                <span aria-hidden="true">+</span>
                Add to knowledge
              </button>
              {current?.status === "review" || current?.status === "done" ? (
                <button
                  type="button"
                  className="reopen-work-button"
                  disabled={reopen.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reopen project and return it to active status?",
                      )
                    ) {
                      reopen.mutate();
                    }
                  }}
                >
                  {reopen.isPending ? "Reopening..." : "Reopen work"}
                </button>
              ) : confirmingFinish ? (
                <div className="finish-work-confirmation" role="alert">
                  <p>Finish this project and continue the workflow?</p>
                  <div>
                    <button
                      type="button"
                      className="finish-work-cancel"
                      disabled={submitReview.isPending}
                      onClick={() => setConfirmingFinish(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="finish-work-confirm"
                      disabled={submitReview.isPending}
                      onClick={() => submitReview.mutate()}
                    >
                      {submitReview.isPending
                        ? "Finishing..."
                        : "Confirm finish"}
                    </button>
                  </div>
                  {submitReview.isError && (
                    <small role="alert">{submitReview.error.message}</small>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmingFinish(true)}>
                  Finish work
                </button>
              )}
            </div>
            <FinishProofs projectID={selected} />
          </aside>
          <section className="activity-builder detail-activity-builder">
            <ActivityCalendar
              activities={activities}
              onActivitiesChange={updateActivities}
              finishDate={finishDate}
              onFinishDateChange={(date) => updateFinish.mutate(date)}
              reviewerCount={current?.reviewer_ids?.length ?? 0}
              readOnly
            />
            {syncActivities.isError && (
              <p className="activity-sync-error">
                Activity changes could not be saved. The previous data has been
                restored.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
