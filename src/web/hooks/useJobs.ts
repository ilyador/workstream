import { useState, useEffect, useCallback } from 'react';
import { getJobs } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

interface Job {
  id: string;
  task_id: string;
  project_id: string;
  status: string;
  current_phase: string | null;
  attempt: number;
  max_attempts: number;
  phases_completed: any[];
  question: string | null;
  answer: string | null;
  review_result: any;
  flow_snapshot: any;
  started_at: string;
  completed_at: string | null;
}

export function useJobs(projectId: string | null) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const data = await getJobs(projectId);
      setJobs(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'job_changed' && event.job) {
        setJobs(prev => {
          const idx = prev.findIndex(j => j.id === event.job.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...event.job };
            return next;
          }
          return [event.job, ...prev];
        });
      } else if (event.type === 'job_deleted' && event.job) {
        setJobs(prev => prev.filter(j => j.id !== event.job.id));
      } else if (event.type === 'full_sync') {
        load();
      }
      // Ignore other event types (task_changed, workstream_changed, etc.)
    });
    return unsub;
  }, [projectId, load]);

  const running = jobs.filter(j => j.status === 'running');
  const paused = jobs.filter(j => j.status === 'paused');
  const review = jobs.filter(j => j.status === 'review');
  const done = jobs.filter(j => j.status === 'done').slice(0, 5);

  return { jobs, running, paused, review, done, loading, reload: load };
}
