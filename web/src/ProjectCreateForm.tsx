import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DivisionPerformanceData } from "./DivisionPerformance";
import { TagMultiSelect } from "./TagMultiSelect";
import {
  ActivityCalendar,
  activityTitle,
  type PlannedActivity,
} from "./ActivityCalendar";
import {
  ProjectPreliminaryNotes,
  type PreliminaryNoteTemplate,
} from "./ProjectPreliminaryNotes";
import {
  ProjectTypeSelector,
  type ProjectTypeOption,
} from "./ProjectTypeSelector";
import type { MetadataField } from "./SettingsPage";
import { CustomTagInput } from "./CustomTagInput";
import { ImageIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import "./project-create.css";
import "./project-form-typography.css";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  team_id?: string;
};
type Project = {
  id: string;
  name: string;
  team_id: string;
  project_type?: string;
  tags?: string[];
  preliminary_note_template_id?: string | null;
  preliminary_notes?: string;
  preliminary_reviewer_notes?: string;
  source?: string | null;
  source_ref?: string | null;
  parent_project_id?: string | null;
  metadata?: {
    finish_date?: string;
    notes?: string | null;
    preliminary_knowledge_id?: string | null;
    project_scope?: {
      division_ids?: string[];
      team_ids?: string[];
      user_ids?: string[];
    };
    custom_fields?: Record<string, string | boolean>;
    knowledge_page_ids?: string[];
    project_cost?: {
      description?: string | null;
      total_cost?: number | null;
      items?: Array<{ description?: string | null; amount?: number | null }>;
    };
  };
  member_ids?: string[];
  reviewer_ids?: string[];
};
type Task = {
  id: string;
  title: string;
  description: string;
  board_column: "todo" | "in_progress" | "review" | "done";
  due_date?: string | null;
  created_at: string;
};
type KnowledgePage = {
  id: string;
  title: string;
  workspace_id: string;
  tags: string[];
};
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };
type ExistingProject = { id: string; name: string; tags?: string[]; created_at?: string; status?: string };
type WorkspaceTeam = { id: string; name: string; division_id?: string; division_ids?: string[] };
type ProjectTemplate = {
  id: string;
  name: string;
  description?: string | null;
  project_type?: string;
  version: number;
};
type ProjectTemplateDetail = ProjectTemplate & {
  structure?: {
    project_title?: string;
    team_id?: string;
    project_scope?: { division_ids?: string[]; team_ids?: string[]; user_ids?: string[] };
    member_ids?: string[];
    reviewer_ids?: string[];
    tags?: string[];
    preliminary_notes?: string;
    metadata?: { custom_fields?: Record<string, string | boolean>; knowledge_page_ids?: string[]; finish_date?: string | null; notes?: string | null; project_cost?: { items?: Array<{ description?: string | null; amount?: number | null }> } };
    parent_project_id?: string | null;
    tasks?: Array<{
      title: string;
      description?: string;
      position?: number;
      checklist?: string[];
    }>;
  };
};
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok)
    throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}

function formatCostAmount(value: string) {
  if (!value) return "";
  const [integer, decimal] = value.split(".");
  const formattedInteger = (integer || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal === undefined ? formattedInteger : `${formattedInteger},${decimal.slice(0, 2)}`;
}

function normalizeCostAmount(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const [integer = "", ...decimals] = normalized.split(".");
  return `${integer || "0"}${decimals.length ? `.${decimals.join("").slice(0, 2)}` : ""}`;
}

export function ProjectCreateForm({
  divisions,
  projectID,
  templateEditID,
  onCreated,
  onCancel,
}: {
  divisions: DivisionPerformanceData[];
  projectID?: string;
  templateEditID?: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const cache = useQueryClient();
  const initialized = useRef("");
  const editing = !!projectID;
  const editingTemplate = !!templateEditID;
  const isEditing = editing || editingTemplate;
  const [name, setName] = useState("");
  const [activities, setActivities] = useState<PlannedActivity[]>([]);
  const [finishDate, setFinishDate] = useState("");
  const [preliminaryTemplateID, setPreliminaryTemplateID] = useState("");
  const [preliminaryNotes, setPreliminaryNotes] = useState("");
  const [preliminaryReviewerNotes, setPreliminaryReviewerNotes] = useState("");
  const [projectType, setProjectType] = useState("operational");
  const [metadataValues, setMetadataValues] = useState<
    Record<string, string | boolean>
  >({});
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [costItems, setCostItems] = useState([{ description: "", amount: "", file: null as File | null, uploading: false }]);
  const costDescriptionRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [costPreview, setCostPreview] = useState<{ url: string; name: string } | null>(null);
  const totalProjectCost = costItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const [knowledgePageIDs, setKnowledgePageIDs] = useState<string[]>([]);
  const [projectScopes, setProjectScopes] = useState<string[]>([]);
  const [parentProjectID, setParentProjectID] = useState("");
  const [parentProjectSearch, setParentProjectSearch] = useState("");
  const [reviewerIDs, setReviewerIDs] = useState<string[]>([]);
  const templateInitialized = useRef("");
  const [templateID, setTemplateID] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const projectTemplates = useQuery({
    queryKey: ["project-templates"],
    queryFn: () => api<ProjectTemplate[]>("/api/v1/project-templates"),
    enabled: !editing,
  });
  const selectedTemplate = useQuery({
    queryKey: ["project-template", templateEditID || templateID],
    queryFn: () =>
      api<ProjectTemplateDetail>(`/api/v1/project-templates/${templateEditID || templateID}`),
    enabled: !editing && !!(templateEditID || templateID),
  });
  useEffect(() => {
    const template = selectedTemplate.data;
    if (editing || !template || templateInitialized.current === template.id)
      return;
    templateInitialized.current = template.id;
    setName(template.structure?.project_title ?? template.name);
    setProjectType(template.project_type ?? "operational");
    const scope = template.structure?.project_scope ?? {};
    const scopeValues = [
      ...(scope.division_ids ?? []).map((id) => `division:${id}`),
      ...(scope.team_ids ?? []).map((id) => `team:${id}`),
      ...(scope.user_ids ?? []).map((id) => `user:${id}`),
    ];
    if (!scopeValues.some((value) => value === `team:${template.structure?.team_id}`) && template.structure?.team_id)
      scopeValues.push(`team:${template.structure.team_id}`);
    setProjectScopes([...new Set([...scopeValues, ...(template.structure?.member_ids ?? []).map((id) => `user:${id}`)])]);
    setReviewerIDs(template.structure?.reviewer_ids ?? []);
    setTags(template.structure?.tags ?? []);
    setPreliminaryNotes(template.structure?.preliminary_notes ?? "");
    setFinishDate(template.structure?.metadata?.finish_date ?? "");
    setNotes(template.structure?.metadata?.notes ?? "");
    setMetadataValues(template.structure?.metadata?.custom_fields ?? {});
    setKnowledgePageIDs(template.structure?.metadata?.knowledge_page_ids ?? []);
    setParentProjectID(template.structure?.parent_project_id ?? "");
    const cost = template.structure?.metadata?.project_cost;
    setCostItems(
      cost?.items?.length
        ? cost.items.map((item) => ({
            description: item.description ?? "",
            amount: item.amount == null ? "" : String(item.amount),
            file: null,
            uploading: false,
          }))
        : [{ description: "", amount: "", file: null, uploading: false }],
    );
    setActivities(
      (template.structure?.tasks ?? []).map((task, index) => ({
        id: `template-${index}`,
        date: new Date().toISOString().slice(0, 10),
        title: task.title,
        description: task.description || task.title,
        boardColumn: "todo",
      })),
    );
  }, [editing, selectedTemplate.data]);
  const workspaceTeams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<WorkspaceTeam[]>("/api/v1/teams"),
  });
  const teams = useMemo<Array<WorkspaceTeam & { divisionName: string }>>(() => {
    if (workspaceTeams.data?.length) {
      return workspaceTeams.data.map((team) => ({
        ...team,
        divisionName:
          divisions.find((division) =>
            (team.division_ids ?? [team.division_id]).includes(division.id),
          )?.name ?? "Organization",
      }));
    }
    return divisions.flatMap((division) =>
      (division.teams ?? []).map((team) => ({
        ...team,
        division_ids: [division.id],
        divisionName: division.name,
      })),
    );
  }, [divisions, workspaceTeams.data]);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/api/v1/users"),
  });
  const currentUser = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<User>("/api/v1/auth/me"),
  });
  const preliminaryTemplates = useQuery({
    queryKey: ["preliminary-note-templates"],
    queryFn: () =>
      api<PreliminaryNoteTemplate[]>("/api/v1/preliminary-note-templates"),
  });
  const knowledge = useQuery({
    queryKey: ["knowledge", "wiki"],
    queryFn: () => api<KnowledgePage[]>("/api/v1/knowledge/wiki"),
  });
  const projectTypes = useQuery({
    queryKey: ["settings", "project-types"],
    queryFn: () => api<ProjectTypeOption[]>("/api/v1/settings/project-types"),
  });
  const metadataFields = useQuery({
    queryKey: ["settings", "metadata-fields"],
    queryFn: () =>
      api<MetadataField[]>("/api/v1/settings/project-metadata-fields"),
  });
  const existingProjects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<ExistingProject[]>("/api/v1/projects"),
  });
  const editingProject = useQuery({
    queryKey: ["project", projectID],
    queryFn: () => api<Project>(`/api/v1/projects/${projectID}`),
    enabled: editing,
  });
  const editingTasks = useQuery({
    queryKey: ["tasks", projectID],
    queryFn: () => api<Task[]>(`/api/v1/tasks?project_id=${projectID}`),
    enabled: editing,
  });
  useEffect(() => {
    const project = editingProject.data;
    if (
      !editing ||
      !project ||
      !editingTasks.data ||
      initialized.current === project.id
    )
      return;
    initialized.current = project.id;
    const metadata = project.metadata ?? {};
    const scope = metadata.project_scope ?? {};
    setName(project.name);
    setProjectType(project.project_type ?? "operational");
    setTags(project.tags ?? []);
    setPreliminaryTemplateID(
      metadata.preliminary_knowledge_id
        ? `knowledge:${metadata.preliminary_knowledge_id}`
        : (project.preliminary_note_template_id ?? ""),
    );
    setPreliminaryNotes(project.preliminary_notes ?? "");
    setPreliminaryReviewerNotes(project.preliminary_reviewer_notes ?? "");
    setFinishDate(metadata.finish_date ?? "");
    setNotes(metadata.notes ?? "");
    const cost = metadata.project_cost;
    setCostItems(
      cost?.items?.length
        ? cost.items.map((item) => ({
            description: item.description ?? "",
            amount: item.amount == null ? "" : String(item.amount),
            file: null,
            uploading: false,
          }))
        : [{
            description: cost?.description ?? "",
            amount: cost?.total_cost == null ? "" : String(cost.total_cost),
            file: null,
            uploading: false,
          }],
    );
    setMetadataValues(metadata.custom_fields ?? {});
    setKnowledgePageIDs(metadata.knowledge_page_ids ?? []);
    setSource(project.source ?? "");
    setSourceRef(project.source_ref ?? "");
    setParentProjectID(project.parent_project_id ?? "");
    setReviewerIDs(project.reviewer_ids ?? []);
    const scopes = [
      ...(scope.division_ids ?? []).map((id) => `division:${id}`),
      ...(scope.team_ids ?? []).map((id) => `team:${id}`),
      ...(scope.user_ids ?? project.member_ids ?? []).map((id) => `user:${id}`),
    ];
    setProjectScopes(scopes.length ? scopes : [`team:${project.team_id}`]);
    setActivities(
      editingTasks.data.map((task) => ({
        id: task.id,
        date: (task.due_date ?? task.created_at).slice(0, 10),
        title: task.title,
        description: task.description || task.title,
        boardColumn: task.board_column,
      })),
    );
  }, [editing, editingProject.data, editingTasks.data]);
  const canEditReviewerNote =
    !!editing &&
    !!currentUser.data?.id &&
    !!editingProject.data?.reviewer_ids?.includes(currentUser.data.id);
  const scopeOptions = [
    ...divisions.map((division) => ({
      value: `division:${division.id}`,
      label: division.name,
      description: "Division · includes its teams",
      tone: "division" as const,
    })),
    ...teams.map((team) => ({
      value: `team:${team.id}`,
      label: team.name,
      description: `Team · ${team.divisionName}`,
      tone: "team" as const,
    })),
    ...(users.data ?? []).map((user) => ({
      value: `user:${user.id}`,
      label: user.name,
      description: `User · ${user.role} · ${user.email}`,
      tone: "user" as const,
    })),
  ];
  const selectedTeamScope = projectScopes
    .find((value) => value.startsWith("team:"))
    ?.slice(5);
  const teamID =
    selectedTeamScope ??
    teams.find((team) =>
      projectScopes.some(
        (scope) =>
          scope.startsWith("division:") &&
          (team.division_ids ?? [team.division_id]).includes(scope.slice(9)),
      ),
    )?.id ??
    (users.data ?? []).find(
      (user) => !!user.team_id && projectScopes.includes(`user:${user.id}`),
    )?.team_id ??
    currentUser.data?.team_id ??
    "";
  const explicitMemberIDs = projectScopes
    .filter((value) => value.startsWith("user:"))
    .map((value) => value.slice(5));
  const projectScopeMetadata = {
    division_ids: projectScopes
      .filter((value) => value.startsWith("division:"))
      .map((value) => value.slice(9)),
    team_ids: projectScopes
      .filter((value) => value.startsWith("team:"))
      .map((value) => value.slice(5)),
    user_ids: explicitMemberIDs,
  };
  const popularTags = useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const project of existingProjects.data ?? []) {
      for (const tag of project.tags ?? []) {
        const key = tag.toLocaleLowerCase();
        const current = counts.get(key);
        counts.set(key, {
          tag: current?.tag ?? tag,
          count: (current?.count ?? 0) + 1,
        });
      }
    }
    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
    );
  }, [existingProjects.data]);
  const recentParentProjects = useMemo(() => {
    const term = parentProjectSearch.trim().toLocaleLowerCase();
    return (existingProjects.data ?? [])
      .filter((project) => project.id !== projectID)
      .filter((project) => !term || project.name.toLocaleLowerCase().includes(term))
      .slice(0, 5);
  }, [existingProjects.data, parentProjectSearch, projectID]);
  const missingRequirements = [
    ...(!name.trim() ? ["Project name"] : []),
    ...(!projectScopes.length ? ["Scope & Members"] : []),
    ...(projectScopes.length && !teamID
      ? ["A scope with an available team"]
      : []),
    ...(!finishDate ? ["Finish date"] : []),
    ...(metadataFields.data ?? [])
      .filter(
        (field) =>
          field.is_required &&
          (metadataValues[field.key] === undefined ||
            metadataValues[field.key] === ""),
      )
      .map((field) => field.name),
  ];
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        team_id: teamID,
        parent_project_id: parentProjectID || null,
        project_type: projectType,
        tags,
        preliminary_note_template_id:
          preliminaryTemplateID &&
          !preliminaryTemplateID.startsWith("knowledge:")
            ? preliminaryTemplateID
            : null,
        preliminary_notes: preliminaryNotes,
        ...(editing && canEditReviewerNote
          ? { preliminary_reviewer_notes: preliminaryReviewerNotes }
          : {}),
        knowledge_page_ids: knowledgePageIDs,
        member_ids: explicitMemberIDs,
        reviewer_ids: reviewerIDs,
        source: source.trim() || null,
        source_ref: sourceRef.trim() || null,
        metadata: {
          created_from: "project_portfolio",
          finish_date: finishDate || null,
          notes: notes.trim() || null,
          preliminary_knowledge_id: preliminaryTemplateID.startsWith(
            "knowledge:",
          )
            ? preliminaryTemplateID.slice(10)
            : null,
          project_scope: projectScopeMetadata,
          custom_fields: metadataValues,
          knowledge_page_ids: knowledgePageIDs,
            project_cost: {
            items: costItems.map((item) => ({
              description: item.description.trim() || null,
              amount: item.amount === "" ? null : Number(item.amount),
            })),
          },
        },
      };
      if (editingTemplate) {
        const template = await api<ProjectTemplateDetail>(`/api/v1/project-templates/${templateEditID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            project_type: projectType,
            version: selectedTemplate.data?.version,
            structure: {
              project_title: name.trim(),
              team_id: teamID,
              parent_project_id: parentProjectID || null,
              project_scope: projectScopeMetadata,
              member_ids: explicitMemberIDs,
              reviewer_ids: reviewerIDs,
              tags,
              preliminary_notes: preliminaryNotes,
              metadata: { custom_fields: metadataValues, knowledge_page_ids: knowledgePageIDs, finish_date: finishDate || null, notes: notes.trim() || null, project_cost: { items: costItems.map((item) => ({ description: item.description.trim() || null, amount: item.amount === "" ? null : Number(item.amount) })) } },
              tasks: activities.map((activity, position) => ({ title: activity.title || activityTitle(activity.description), description: activity.description, position, board_column: activity.boardColumn ?? "todo" })),
            },
          }),
        });
        return { id: template.id } as Project;
      }
      const project = editing
        ? await api<Project>(`/api/v1/projects/${projectID}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : templateID
          ? await api<Project>(
              `/api/v1/project-templates/${templateID}/projects`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": crypto.randomUUID(),
                },
                body: JSON.stringify(payload),
              },
            )
          : await api<Project>("/api/v1/projects", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: JSON.stringify(payload),
            });
      if (!editingTemplate)
        await Promise.all(costItems.filter((item) => item.file).map((item) => api(`/api/v1/projects/${project.id}/cost-attachments`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: (() => { const body = new FormData(); body.append("file", item.file as File); return body; })(),
        })));
      if (!editing && templateID) {
        if (saveAsTemplate)
          await api("/api/v1/project-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({ name: name.trim(), project_type: projectType, visibility: "tenant", source_project_id: project.id, allow_incomplete: true }),
          });
        return project;
      }
      const previous = new Map(
        (editingTasks.data ?? []).map((task) => [task.id, task]),
      );
      const nextIDs = new Set(activities.map((activity) => activity.id));
      const requests: Promise<unknown>[] = [];
      if (editing)
        for (const task of editingTasks.data ?? [])
          if (!nextIDs.has(task.id))
            requests.push(
              api(`/api/v1/tasks/${task.id}`, { method: "DELETE" }),
            );
      for (const [position, activity] of activities.entries()) {
        const task = previous.get(activity.id);
        const taskPayload = {
          title: activityTitle(activity.description),
          description: activity.description,
          due_date: `${activity.date}T23:59:59Z`,
          board_column: activity.boardColumn ?? "todo",
          position,
        };
        if (task)
          requests.push(
            api(`/api/v1/tasks/${task.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(taskPayload),
            }),
          );
        else
          requests.push(
            api<Task>("/api/v1/tasks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: JSON.stringify({
                ...taskPayload,
                project_id: project.id,
                assignee_id: null,
              }),
            }),
          );
      }
      await Promise.all(requests);
      if (!editing && saveAsTemplate)
        await api("/api/v1/project-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ name: name.trim(), project_type: projectType, visibility: "tenant", source_project_id: project.id, allow_incomplete: true }),
        });
      return project;
    },
    onSuccess: (project) => {
      cache.invalidateQueries({ queryKey: ["projects"] });
      cache.invalidateQueries({ queryKey: ["project", project.id] });
      cache.invalidateQueries({ queryKey: ["tasks", project.id] });
      cache.invalidateQueries({ queryKey: ["dashboard-summary"] });
      onCreated(project.id);
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!missingRequirements.length) save.mutate();
  }
  if ((editing && (editingProject.isPending || editingTasks.isPending)) || (editingTemplate && selectedTemplate.isPending))
    return (
      <section className="project-create-card">
        <div className="create-form-head">
          <div>
            <span className="eyebrow">Edit project</span>
            <h3>Loading project workspace...</h3>
            <p>Preparing the existing project data and activities.</p>
          </div>
        </div>
      </section>
    );
  return (
    <section className="project-create-card">
      <div className="create-form-head">
        <div>
          <span className="eyebrow">
            {isEditing ? "Edit project" : "New project"}
          </span>
          <input
            className="project-heading-title-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled project"
            maxLength={160}
            aria-label="Project title"
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close project form"
        >
          x
        </button>
      </div>
      <form onSubmit={submit} className="project-create-layout">
        <div className="project-main-column">
          {!isEditing && (
            <label className="project-template-picker">
              <span>Start from project template</span>
              <select
                value={templateID}
                onChange={(e) => setTemplateID(e.target.value)}
              >
                <option value="">Blank project</option>
                {(projectTemplates.data ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · v{template.version}
                  </option>
                ))}
              </select>
              <small>
                {selectedTemplate.data?.description ??
                  "Reuse the structure of a completed project, with progress and assignments reset."}
              </small>
            </label>
          )}
          <div className="activity-builder">
            <div className="activity-head">
              <div>
                <span>Project activities</span>
                <small>
                  Switch between Calendar, Tree, and Kanban modes. All views
                  share the same activities.
                </small>
              </div>
              <div className="calendar-legend">
                <span className="legend-today">Today</span>
                <span className="legend-activity">Activity</span>
                <span className="legend-finish">Finish</span>
              </div>
            </div>
            <ActivityCalendar
              activities={activities}
              onActivitiesChange={setActivities}
              finishDate={finishDate}
              onFinishDateChange={setFinishDate}
              reviewerCount={reviewerIDs.length}
              periodViews
            />
          </div>
          <ProjectPreliminaryNotes
            value={preliminaryNotes}
            onChange={setPreliminaryNotes}
            reviewerValue={preliminaryReviewerNotes}
            onReviewerChange={setPreliminaryReviewerNotes}
            canEditReviewerNote={canEditReviewerNote}
            templates={preliminaryTemplates.data ?? []}
            selectedKnowledgeIDs={knowledgePageIDs}
            onKnowledgeIDsChange={setKnowledgePageIDs}
          />
          <details className="project-cost-section">
              <summary className="project-cost-heading">
                <div>
                  <span>Project costs <small>(optional)</small></span>
                  <p>Upload a related cost image and add one or more cost items.</p>
                </div>
                <strong>Total Cost <b>{formatCostAmount(totalProjectCost ? totalProjectCost.toFixed(2) : "0")}</b></strong>
              </summary>
              <div className="project-cost-items">
                <div className="project-cost-item-head" aria-hidden="true">
                  <span>Cost Description</span>
                  <span>Amount</span>
                  <span>Attachment</span>
                </div>
                {costItems.map((item, index) => (
                  <div className="project-cost-item" key={index}>
                    <input ref={(element) => { costDescriptionRefs.current[index] = element; }} aria-label={`Cost Description ${index + 1}`} value={item.description} onChange={(e) => setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, description: e.target.value } : current))} maxLength={500} placeholder="e.g. Vendor quotation" />
                    <input aria-label={`Amount ${index + 1}`} inputMode="decimal" value={formatCostAmount(item.amount)} onChange={(e) => setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, amount: normalizeCostAmount(e.target.value) } : current))} placeholder="0" />
                    <div className={`project-cost-attachment${item.file ? " has-file" : ""}`}>
                      {item.uploading ? <Loader2 className="project-cost-loading" size={16} aria-label="Uploading attachment" /> : item.file ? <>
                        <button type="button" className="project-cost-filename" onClick={() => setCostPreview({ url: URL.createObjectURL(item.file as File), name: item.file?.name ?? "Attachment" })} title="Preview attachment">{item.file.name}</button>
                        <label className="project-cost-action" title="Replace attachment">
                          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Replace Cost Image ${index + 1}`} onChange={(e) => { const file = e.target.files?.[0] ?? null; setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, file, uploading: !!file } : current)); if (file) window.setTimeout(() => setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, uploading: false } : current)), 350); }} />
                          <Pencil size={14} />
                        </label>
                        <button type="button" className="project-cost-action" title="Delete attachment" onClick={() => setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, file: null, uploading: false } : current))}><Trash2 size={14} /></button>
                      </> : <label className="project-cost-file" title="Upload image">
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload Cost Image ${index + 1}`} onChange={(e) => { const file = e.target.files?.[0] ?? null; setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, file, uploading: !!file } : current)); if (file) window.setTimeout(() => setCostItems((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, uploading: false } : current)), 350); }} />
                        <ImageIcon size={16} strokeWidth={1.8} />
                      </label>}
                    </div>
                  </div>
                ))}
                <button type="button" className="project-cost-add" onClick={() => { const nextIndex = costItems.length; setCostItems((items) => [...items, { description: "", amount: "", file: null, uploading: false }]); requestAnimationFrame(() => costDescriptionRefs.current[nextIndex]?.focus()); }}>
                  + Add new
                </button>
              </div>
            </details>
        </div>
        <aside className="project-settings-column">
          <div className="parent-project-picker">
            <label htmlFor="parent-project-search">
              <span>Parent Project</span>
              <input
                id="parent-project-search"
                value={parentProjectSearch}
                onChange={(e) => setParentProjectSearch(e.target.value)}
                placeholder="Search parent project"
                maxLength={160}
              />
            </label>
            <div className="recent-project-heading">Recent project</div>
            <div className="recent-project-list" role="radiogroup" aria-label="Recent parent projects">
              {recentParentProjects.map((project) => (
                <button
                  type="button"
                  className={`recent-project-option${parentProjectID === project.id ? " selected" : ""}`}
                  key={project.id}
                  role="radio"
                  aria-checked={parentProjectID === project.id}
                  onClick={() => setParentProjectID((current) => current === project.id ? "" : project.id)}
                >
                  <i aria-hidden="true" />
                  <span>{project.name}</span>
                </button>
              ))}
              {!recentParentProjects.length && <small className="recent-project-empty">No matching projects.</small>}
            </div>
          </div>
          <label>
            <span>Scope & Members</span>
            <TagMultiSelect
              options={scopeOptions}
              value={projectScopes}
              onChange={setProjectScopes}
              placeholder="Select divisions, teams, or specific users"
            />
            <small>
              One field for project-wide divisions, teams, and individual
              members.
            </small>
          </label>
          <ProjectTypeSelector
            value={projectType}
            onChange={setProjectType}
            options={projectTypes.data ?? []}
          />
          {!!metadataFields.data?.length && (
            <div className="dynamic-metadata-fields">
              <strong>Project metadata</strong>
              {metadataFields.data.map((field) => (
                <DynamicMetadataField
                  key={field.id}
                  field={field}
                  value={metadataValues[field.key]}
                  onChange={(value) =>
                    setMetadataValues((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                />
              ))}
            </div>
          )}
          <label>
            <span>Project tags</span>
            <CustomTagInput
              value={tags}
              onChange={setTags}
              popularTags={popularTags}
            />
            <small>Add labels for filtering and project discovery.</small>
          </label>
          <label>
            <span>Reviewers</span>
            <TagMultiSelect
              options={(users.data ?? [])
                .filter((user) => !explicitMemberIDs.includes(user.id))
                .map((user) => ({
                  value: user.id,
                  label: user.name,
                  description: `${user.role} - ${user.email}`,
                }))}
              value={reviewerIDs}
              onChange={setReviewerIDs}
              placeholder="Optional reviewers"
            />
            <small>If empty, Finish completes the project directly.</small>
          </label>
          <label>
            <span>Linked knowledge pages</span>
            <TagMultiSelect
              options={(knowledge.data ?? []).map((page) => ({
                value: page.id,
                label: page.title,
                description: Array.isArray(page.tags)
                  ? page.tags.join(", ")
                  : "Wiki page",
              }))}
              value={knowledgePageIDs}
              onChange={setKnowledgePageIDs}
              placeholder={knowledge.isLoading ? "Loading..." : "Select pages"}
            />
          </label>
          <label>
            <span>Notes</span>
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Project context, constraints, or management notes"
            />
          </label>
          <details>
            <summary>Additional information</summary>
            <div className="additional-fields">
              <label>
                <span>External source</span>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. woocommerce"
                />
              </label>
              <label>
                <span>Reference ID</span>
                <input
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  placeholder="e.g. order-1042"
                />
              </label>
            </div>
          </details>
        </aside>
        {!!missingRequirements.length && (
          <div className="project-requirements">
            <strong>
              {isEditing
                ? "Complete the following before saving this project template:"
                : "Complete the following before creating this project:"}
            </strong>
            <ul>
              {missingRequirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {save.isError && (
          <p className="form-error layout-error">{save.error.message}</p>
        )}
        <div className="form-actions layout-actions">
          {!isEditing && (
            <div className="template-save-option layout-template-option">
              <label className="template-save-toggle">
                <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
                <span>Save this project as a reusable template</span>
              </label>
            </div>
          )}
          <button
            className="create-submit"
            disabled={save.isPending || !!missingRequirements.length}
          >
            {save.isPending
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save changes"
                : "Create project"}
          </button>
        </div>
      </form>
      {costPreview && (
        <div className="project-cost-preview-backdrop" role="presentation" onClick={() => { URL.revokeObjectURL(costPreview.url); setCostPreview(null); }}>
          <div className="project-cost-preview" role="dialog" aria-modal="true" aria-label={costPreview.name} onClick={(event) => event.stopPropagation()}>
            <header><strong>{costPreview.name}</strong><button type="button" onClick={() => { URL.revokeObjectURL(costPreview.url); setCostPreview(null); }} aria-label="Close preview">×</button></header>
            <img src={costPreview.url} alt={costPreview.name} />
          </div>
        </div>
      )}
    </section>
  );
}

function DynamicMetadataField({
  field,
  value,
  onChange,
}: {
  field: MetadataField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (field.type === "boolean")
    return (
      <label className="metadata-checkbox">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {field.name}
          {field.is_required ? " *" : ""}
        </span>
      </label>
    );
  return (
    <label>
      <span>
        {field.name}
        {field.is_required ? " *" : ""}
      </span>
      {field.type === "select" ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        >
          <option value="">Select {field.name}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )}
    </label>
  );
}
