import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type Project = { id: string; name: string; status: string; updated_at: string };
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}

export function ProjectPanel({ teamID }: { teamID: string }) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => request<Project[]>("/api/v1/projects") });
  const createProject = useMutation({
    mutationFn: (projectName: string) => request<Project>("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ name: projectName, team_id: teamID, metadata: { created_from: "dashboard" } })
    }),
    onSuccess: () => { setName(""); queryClient.invalidateQueries({ queryKey: ["projects"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }); }
  });
  function submit(event: FormEvent) { event.preventDefault(); const value=name.trim(); if(value) createProject.mutate(value); }

  return <article className="panel activity-panel">
    <div className="panel-head"><div><span className="eyebrow">Execution</span><h1>Projects</h1></div></div>
    <form onSubmit={submit} style={{display:"flex",gap:10,margin:"20px 0"}}>
      <input aria-label="Project name" value={name} onChange={(event)=>setName(event.target.value)} placeholder="Name a new project" style={{flex:1,border:"1px solid #dfe5df",borderRadius:10,padding:"12px 14px",font:"inherit"}} />
      <button className="primary-button" style={{margin:0}} disabled={createProject.isPending}>{createProject.isPending?"Creating...":"Create project"}</button>
    </form>
    {createProject.error && <p style={{color:"#a13b3b",fontSize:12}}>{createProject.error.message}</p>}
    {projects.isPending && <div className="empty-state">Loading projects...</div>}
    {projects.data?.length===0 && <div className="empty-state">No projects yet. Create the first Execution workspace above.</div>}
    {projects.data?.map(project=><div className="activity-item" key={project.id}><span className="event-icon">P</span><div><strong>{project.name}</strong><p>Status: {project.status}</p></div><time>{new Date(project.updated_at).toLocaleDateString()}</time></div>)}
  </article>;
}

