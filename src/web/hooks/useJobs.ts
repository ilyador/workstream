import { useEffect } from 'react';
import { getJobs } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useJobs(projectId: string | null) {
  const {
    data: jobs,
    setData: setJobs,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, getJobs, {
    createInitialValue: () => [],
    getErrorMessage: () => 'Failed to load jobs',
  });

  useEffect(() => {
    void load();
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
        void load();
      }
      // Ignore other event types (task_changed, workstream_changed, etc.)
    });
    return unsub;
  }, [projectId, load, setJobs]);

  useEffect(() => {
    if (!projectId) return;
    const hasActiveJobs = jobs.some(job => (
      job.status === 'queued'
      || job.status === 'running'
      || job.status === 'paused'
      || job.status === 'review'
    ));
    if (!hasActiveJobs) return;

    const timer = setInterval(() => {
      void load();
    }, 3000);

    return () => clearInterval(timer);
  }, [jobs, load, projectId]);

  const running = jobs.filter(j => j.status === 'running');
  const paused = jobs.filter(j => j.status === 'paused');
  const review = jobs.filter(j => j.status === 'review');
  const done = jobs.filter(j => j.status === 'done').slice(0, 5);

  return { jobs, running, paused, review, done, loading, error, ready, reload: load };
}
