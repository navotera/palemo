import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./checklist.css";

type Item = { id: string; label: string; is_done: boolean };
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = await response.json() as Envelope<T>;
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}

export function TaskChecklist({ taskID }: { taskID: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const key = ["checklist", taskID];
  const items = useQuery({ queryKey: key, queryFn: () => api<Item[]>(`/api/v1/tasks/${taskID}/checklist`), enabled: open });
  const create = useMutation({
    mutationFn: (value: string) => api<Item>(`/api/v1/tasks/${taskID}/checklist`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ label: value }) }),
    onSuccess: () => { setLabel(""); queryClient.invalidateQueries({ queryKey: key }); }
  });
  const toggle = useMutation({
    mutationFn: (item: Item) => api<Item>(`/api/v1/tasks/${taskID}/checklist/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_done: !item.is_done }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key })
  });
  function submit(event: FormEvent) { event.preventDefault(); if (label.trim()) create.mutate(label.trim()); }
  return <div className="checklist">
    <button className="checklist-toggle" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Checklist {open ? "−" : "+"}</button>
    {open && <div className="checklist-body">
      {items.data?.map(item => <label key={item.id}><input type="checkbox" checked={item.is_done} onChange={() => toggle.mutate(item)} /><span>{item.label}</span></label>)}
      {!items.isPending && items.data?.length === 0 && <small>No checklist items</small>}
      <form onSubmit={submit}><input aria-label="Checklist item" value={label} onChange={event => setLabel(event.target.value)} placeholder="Add step" /><button disabled={create.isPending}>Add</button></form>
    </div>}
  </div>;
}
