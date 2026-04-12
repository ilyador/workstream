import { useEffect, useRef } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import type { TaskRecord } from '../lib/api';
import type { JobRecord } from '../components/job-types';

interface UseProjectWorkspaceEffectsArgs {
  focusTaskId: string | null;
  focusWsId: string | null;
  setSearchParams: SetURLSearchParams;
  jobs: JobRecord[];
  tasks: TaskRecord[];
  taskTitleMap: Record<string, string>;
  notify: (title: string, body: string) => void;
  currentProjectName: string | null;
}

export function useProjectWorkspaceEffects({
  focusTaskId,
  focusWsId,
  setSearchParams,
  jobs,
  tasks,
  taskTitleMap,
  notify,
  currentProjectName,
}: UseProjectWorkspaceEffectsArgs) {
  useEffect(() => {
    if (!focusTaskId && !focusWsId) return;
    const timer = setTimeout(() => setSearchParams({}, { replace: true }), 6000);
    return () => clearTimeout(timer);
  }, [focusTaskId, focusWsId, setSearchParams]);

  const prevJobStatuses = useRef<Record<string, string>>({});
  const prevTaskStatuses = useRef<Record<string, string>>({});

  useEffect(() => {
    const prev = prevJobStatuses.current;
    for (const job of jobs) {
      const oldStatus = prev[job.id];
      if (oldStatus !== job.status) {
        const title = taskTitleMap[job.task_id] || 'Task';
        if (job.status === 'failed') {
          notify('Task failed', `${title}: ${job.question || 'unknown error'}`);
        } else if (oldStatus) {
          if (job.status === 'paused') {
            notify('Question asked', `${title} needs your input`);
          } else if (job.status === 'done') {
            notify('Task completed', `${title} finished successfully`);
          }
        }
      }
      prev[job.id] = job.status;
    }
  }, [jobs, notify, taskTitleMap]);

  useEffect(() => {
    const prev = prevTaskStatuses.current;
    for (const task of tasks) {
      const oldStatus = prev[task.id];
      if (oldStatus && oldStatus !== task.status && task.status === 'review') {
        notify('Ready for review', `${task.title} is ready for review`);
      }
      prev[task.id] = task.status;
    }
  }, [notify, tasks]);

  useEffect(() => {
    document.title = currentProjectName
      ? `${currentProjectName} - WorkStream`
      : 'WorkStream';
  }, [currentProjectName]);
}
