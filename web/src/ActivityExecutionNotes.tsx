import { FormEvent, useState } from "react";
import type { PlannedActivity } from "./ActivityCalendar";

type Note = { id: string; content_markdown: string; occurred_at: string };
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = await response.json() as Envelope<T>;
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}

export function ActivityExecutionNotes({ activities }: { activities: PlannedActivity[] }) {
  const [selectedID, setSelectedID] = useState("");
  const [notes, setNotes] = useState<Record<string, Note[]>>({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function selectActivity(id: string) {
    setSelectedID(id); setDraft(""); setError("");
    if (notes[id]) return;
    try { setNotes(current => ({ ...current, [id]: [] })); const result = await request<Note[]>(`/api/v1/tasks/${id}/notes`); setNotes(current => ({ ...current, [id]: result })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load notes"); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); const content = draft.trim(); if (!selectedID || !content || pending) return;
    setPending(true); setError("");
    try { const note = await request<Note>(`/api/v1/tasks/${selectedID}/notes`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ content_markdown: content }) }); setNotes(current => ({ ...current, [selectedID]: [note, ...(current[selectedID] ?? [])] })); setDraft(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save note"); }
    finally { setPending(false); }
  }

  return <section className="execution-notes panel">
    <div className="execution-notes-head"><div><span className="eyebrow">Realization log</span><h2>Catatan pelaksanaan activity</h2><p>Rencana activity tetap menjadi rencana; tulis perkembangan, hasil, atau kendala di sini.</p></div><span>{activities.length} activity</span></div>
    {activities.length === 0 && <div className="empty-state">Belum ada activity untuk diberi catatan.</div>}
    {activities.length > 0 && <div className="execution-notes-grid"><div className="execution-note-activities">{activities.map(activity => <button type="button" className={selectedID === activity.id ? "selected" : ""} key={activity.id} onClick={() => selectActivity(activity.id)}><strong>{activity.title}</strong><small>{activity.date} · {(notes[activity.id] ?? []).length} catatan</small></button>)}</div><div className="execution-note-detail">{!selectedID && <div className="empty-state">Pilih activity untuk melihat atau menambah catatan realisasi.</div>}{selectedID && <><div className="execution-note-list">{(notes[selectedID] ?? []).map(note => <article key={note.id}><p>{note.content_markdown}</p><time>{new Date(note.occurred_at).toLocaleString()}</time></article>)}{notes[selectedID]?.length === 0 && <small className="note-muted">Belum ada catatan. Tambahkan realisasi pertama.</small>}</div><form onSubmit={submit}><textarea aria-label="Catatan pelaksanaan" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Contoh: Data sudah diverifikasi, menunggu persetujuan..." maxLength={20000} /><button className="primary-button" type="submit" disabled={pending || !draft.trim()}>{pending ? "Menyimpan..." : "Tambah catatan"}</button></form></>}</div></div>}
    {error && <p className="activity-sync-error">{error}</p>}
  </section>;
}
