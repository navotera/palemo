import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProjectActivityRealization } from "./ProjectActivityRealization";
import "./project-information-tabs.css";

type Project = {
  source?: string | null;
  source_ref?: string | null;
  preliminary_notes?: string | null;
  metadata?: {
    knowledge_page_ids?: string[];
    project_cost?: {
      items?: Array<{ description?: string | null; amount?: number | null }>;
    };
  };
};
type KnowledgePage = { id: string; title: string };
type CostAttachment = { id: string; filename: string; content_type?: string | null };
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
  const body = await response.json() as Envelope<T>;
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}

const formatAmount = (amount: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(amount);

export function ProjectInformationTabs({ projectID }: { projectID: string }) {
  const [tab, setTab] = useState<"activity" | "knowledge" | "notes" | "costs">("activity");
  const project = useQuery({ queryKey: ["project", projectID, "information"], queryFn: () => api<Project>(`/api/v1/projects/${encodeURIComponent(projectID)}`), enabled: !!projectID });
  const knowledge = useQuery({ queryKey: ["knowledge", "project-information"], queryFn: () => api<KnowledgePage[]>("/api/v1/knowledge/wiki"), enabled: !!projectID });
  const attachments = useQuery({ queryKey: ["project-cost-attachments", projectID], queryFn: () => api<CostAttachment[]>(`/api/v1/projects/${encodeURIComponent(projectID)}/cost-attachments`), enabled: !!projectID });
  const data = project.data;
  const knowledgeIDs = data?.metadata?.knowledge_page_ids ?? [];
  const knowledgePages = (knowledge.data ?? []).filter((page) => knowledgeIDs.includes(page.id));
  const costs = data?.metadata?.project_cost?.items ?? [];
  const total = costs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return <section className="project-information panel">
    <header className="project-information-head"><div><h2>Supporting details</h2></div></header>
    <nav className="project-information-tabs" aria-label="Project information tabs">
      <button type="button" className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity realization</button>
      <button type="button" className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>Knowledge Source</button>
      <button type="button" className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>Preliminary Notes</button>
      <button type="button" className={tab === "costs" ? "active" : ""} onClick={() => setTab("costs")}>Project Costs</button>
    </nav>
    <div className="project-information-content">
      {tab === "activity" && <ProjectActivityRealization projectID={projectID} />}
      {tab === "knowledge" && <div className="project-information-list">
        {data?.source && <p><strong>Source:</strong> {data.source}{data.source_ref ? ` · ${data.source_ref}` : ""}</p>}
        {knowledgePages.length ? <ul>{knowledgePages.map((page) => <li key={page.id}>{page.title}</li>)}</ul> : <p className="project-information-empty">No knowledge sources added.</p>}
      </div>}
      {tab === "notes" && <div className="project-information-notes">{data?.preliminary_notes?.trim() ? <p>{data.preliminary_notes}</p> : <p className="project-information-empty">No preliminary notes added.</p>}</div>}
      {tab === "costs" && <div className="project-information-costs">
        {costs.length ? <ul>{costs.map((item, index) => <li key={`${item.description ?? "cost"}-${index}`}><span>{item.description || "Unnamed cost"}</span><strong>{formatAmount(Number(item.amount) || 0)}</strong></li>)}</ul> : <p className="project-information-empty">No project costs added.</p>}
        <div className="project-information-total"><span>Total Cost</span><strong>{formatAmount(total)}</strong></div>
        {attachments.data?.length ? <div className="project-information-attachments"><small>Attachments</small><ul>{attachments.data.map((item) => <li key={item.id}>{item.filename}</li>)}</ul></div> : null}
      </div>}
    </div>
  </section>;
}
