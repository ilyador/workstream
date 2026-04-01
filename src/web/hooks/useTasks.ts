import { useState, useEffect, useCallback } from 'react';
import { getTasks, createTask as apiCreateTask, updateTask as apiUpdateTask, deleteTask as apiDeleteTask, subscribeToChanges } from '../lib/api';

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  type: string;
  mode: string;
  effort: string;
  multiagent: string;
  status: string;
  blocked_by: string[];
  assignee: string | null;
  milestone_id: string | null;
  position: number;
  images: string[];
  followup_notes: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export function useTasks(projectId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const data = await getTasks(projectId);
      setTasks(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    if (!projectId) return;
    const unsub = subscribeToChanges(projectId, () => { load(); });
    return unsub;
  }, [projectId, load]);

  async function createTask(data: { title: string; project_id: string; [key: string]: any }) {
    await apiCreateTask(data);
    await load();
  }

  async function updateTask(id: string, data: Record<string, unknown>) {
    await apiUpdateTask(id, data);
    await load();
  }

  async function deleteTask(id: string) {
    await apiDeleteTask(id);
    await load();
  }

  const backlog = tasks.filter(t => ['backlog', 'todo'].includes(t.status));
  const active = tasks.filter(t => ['in_progress', 'paused', 'review'].includes(t.status));
  const done = tasks.filter(t => t.status === 'done');

  return { tasks, backlog, active, done, loading, error, createTask, updateTask, deleteTask, reload: load };
}
