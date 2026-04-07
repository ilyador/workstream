import { useEffect } from 'react';
import { getTasks, createTask as apiCreateTask, updateTask as apiUpdateTask, deleteTask as apiDeleteTask } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useTasks(projectId: string | null) {
  const {
    data: tasks,
    setData: setTasks,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, getTasks, {
    createInitialValue: () => [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load tasks',
  });

  useEffect(() => {
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'task_changed' && event.task) {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === event.task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...event.task };
            return next;
          }
          return [...prev, event.task].sort((a, b) => a.position - b.position);
        });
      } else if (event.type === 'task_deleted' && event.task) {
        setTasks(prev => prev.filter(t => t.id !== event.task.id));
      } else if (event.type === 'full_sync') {
        void load();
      }
      // Ignore other event types (job_changed, workstream_changed, etc.)
    });
    return unsub;
  }, [projectId, load, setTasks]);

  async function createTask(data: Parameters<typeof apiCreateTask>[0]) {
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

  return { tasks, setTasks, backlog, active, done, loading, error, ready, createTask, updateTask, deleteTask, reload: load };
}
