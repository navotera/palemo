import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "./executive-projects.css";

type Template = { id: string; name: string; description?: string | null; project_type?: string; version: number; created_by?: string | null; created_by_name?: string | null; created_at?: string | null; usage_count?: number; tags?: string[] };
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };

function templateType(template: Template) {
  return template.project_type || "operational";
}

function templateTypeLabel(type: string) {
  return type.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor || unit === "second") return formatter.format(Math.round(seconds / divisor), unit);
  }
  return formatter.format(0, "second");
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include" });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}

export function ProjectTemplates({ onCreate, onEdit }: { onCreate: () => void; onEdit: (id: string) => void }) {
  const templates = useQuery({ queryKey: ["project-templates"], queryFn: () => api<Template[]>("/api/v1/project-templates") });
  const templateItems = templates.data ?? [];
  const templateTypes = [...new Set(templateItems.map(templateType))].sort((a, b) => a.localeCompare(b));
  const [activeType, setActiveType] = useState("operational");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [minimumUsage, setMinimumUsage] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  useEffect(() => {
    if (templateTypes.length && activeType !== "most-used" && !templateTypes.includes(activeType)) setActiveType(templateTypes[0]);
  }, [activeType, templateTypes.join("|")]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const creators = [...new Set(templateItems.map((template) => template.created_by_name).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  const tags = [...new Set(templateItems.flatMap((template) => template.tags ?? []))].sort((a, b) => a.localeCompare(b));
  const hasFilters = Boolean(creatorFilter || createdFrom || createdTo || minimumUsage || tagFilter);
  const templateTabs = ["most-used", ...templateTypes];
  const visibleTemplates = templateItems.filter((template) => {
    if (activeType !== "most-used" && templateType(template) !== activeType) return false;
    if (!normalizedSearch) return true;
    if (![template.name, template.description ?? "", templateTypeLabel(templateType(template))].some((value) => value.toLowerCase().includes(normalizedSearch))) return false;
    return true;
  }).filter((template) => {
    if (creatorFilter && template.created_by_name !== creatorFilter) return false;
    const createdAt = template.created_at ? new Date(template.created_at).getTime() : 0;
    if (createdFrom && createdAt < new Date(`${createdFrom}T00:00:00`).getTime()) return false;
    if (createdTo && createdAt > new Date(`${createdTo}T23:59:59`).getTime()) return false;
    if (minimumUsage && (template.usage_count ?? 0) < Number(minimumUsage)) return false;
    if (tagFilter && !(template.tags ?? []).includes(tagFilter)) return false;
    return true;
  }).sort((a, b) => activeType === "most-used" ? (b.usage_count ?? 0) - (a.usage_count ?? 0) || a.name.localeCompare(b.name) : 0);
  return (
    <section className="content-grid project-templates-page">
      <article className="panel executive-projects">
        <div className="panel-head">
          <div><h1>Template List</h1><p>Reusable structures for research, routine work, and learning paths.</p></div>
          <div className="template-list-actions"><label className="template-search"><span className="sr-only">Search templates</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search templates..." aria-label="Search templates" /></label><span className="portfolio-count">{templateItems.length} templates</span><button type="button" className={`template-filter-button${hasFilters ? " active" : ""}`} onClick={() => setFilterOpen((current) => !current)} aria-expanded={filterOpen} aria-label="Filter templates" title="Filter templates"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg></button>{filterOpen && <div className="template-filter-panel"><label><span>Created by</span><select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}><option value="">All creators</option>{creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}</select></label><label><span>Tag</span><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All tags</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label><label><span>Created from</span><input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /></label><label><span>Created to</span><input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></label><label><span>Minimum usage</span><input type="number" min="0" value={minimumUsage} onChange={(event) => setMinimumUsage(event.target.value)} placeholder="0" /></label><button type="button" onClick={() => { setCreatorFilter(""); setTagFilter(""); setCreatedFrom(""); setCreatedTo(""); setMinimumUsage(""); }}>Clear filters</button></div>}</div>
        </div>
        {templates.isPending && <p className="template-page-state">Loading templates...</p>}
        {templates.isError && <p className="template-page-state">Unable to load templates.</p>}
        {!templates.isPending && !templates.data?.length && <p className="empty-state">No project templates yet. Create a project and save it as a reusable template.</p>}
        {!!templateItems.length && <>
          <div className="template-type-tabs" role="tablist" aria-label="Template types">{templateTabs.map((type) => { const count = templateItems.filter((template) => type === "most-used" || templateType(template) === type).length; return <button key={type} type="button" role="tab" aria-selected={activeType === type} className={activeType === type ? "active" : ""} onClick={() => setActiveType(type)}><span>{type === "most-used" ? "Most Used" : templateTypeLabel(type)}</span><strong>{count}</strong></button>; })}</div>
          <div className="project-summary-table template-summary-table"><div className="summary-row summary-header"><span>Template</span><span>Type</span><span>Created by</span><span>Created on</span><span>Actions</span></div>{visibleTemplates.map((template) => <div className="summary-row template-summary-row" key={template.id}><button type="button" className="project-name-link" onClick={() => onEdit(template.id)}><strong>{template.name}</strong></button><span className="template-type-cell">{templateTypeLabel(templateType(template))}</span><span className="template-creator-cell">{template.created_by_name || "Unknown user"}</span><time className="template-created-cell" dateTime={template.created_at ?? undefined} title={template.created_at ? new Date(template.created_at).toLocaleString() : undefined}>{relativeDate(template.created_at)}</time><span className="template-row-actions"><button className="template-action-button" type="button" onClick={() => onEdit(template.id)}>Edit</button><button className="template-action-button" type="button" onClick={onCreate}>Use template</button></span></div>)}</div>
        </>}
      </article>
    </section>
  );
}
