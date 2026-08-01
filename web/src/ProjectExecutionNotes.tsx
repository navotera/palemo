import { useQuery } from "@tanstack/react-query";
import { ActivityExecutionNotes } from "./ActivityExecutionNotes";
import type { PlannedActivity } from "./ActivityCalendar";

type Task = { id: string; title: string; description?: string; due_date?: string | null; created_at: string; board_column?: PlannedActivity["boardColumn"] };
type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };

async function fetchTasks(projectID: string): Promise<PlannedActivity[]> {
  const response = await fetch(`/api/v1/tasks?project_id=${encodeURIComponent(projectID)}`, { credentials: "include" });
  const body = await response.json() as Envelope<Task[]>;
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Unable to load activities");
  return (body.data ?? []).map(task => ({ id: task.id, title: task.title, description: task.description ?? task.title, date: task.due_date ?? task.created_at.slice(0, 10), boardColumn: task.board_column }));
}

export function ProjectExecutionNotes({ projectID }: { projectID: string }) {
  const tasks = useQuery({ queryKey: ["tasks", projectID, "execution-notes"], queryFn: () => fetchTasks(projectID), enabled: !!projectID });
  return <ActivityExecutionNotes activities={tasks.data ?? []} />;
}
