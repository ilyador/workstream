import type { JobStatus, JobView } from '../components/job-types';

export const JOB_STATUS_PRIORITY: Record<JobStatus, number> = {
  running: 0,
  queued: 1,
  paused: 2,
  review: 3,
  done: 4,
  failed: 5,
};

function jobTimestamp(job: JobView): number {
  const value = job.completedAt ?? job.startedAt;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function comparePrimaryJobs(a: JobView, b: JobView): number {
  const priorityDiff = (JOB_STATUS_PRIORITY[a.status] ?? 99) - (JOB_STATUS_PRIORITY[b.status] ?? 99);
  if (priorityDiff !== 0) return priorityDiff;

  const timestampDiff = jobTimestamp(b) - jobTimestamp(a);
  if (timestampDiff !== 0) return timestampDiff;

  return a.id.localeCompare(b.id);
}

export function pickPrimaryJobs(jobs: JobView[]): JobView[] {
  const bestByTask = new Map<string, JobView>();

  for (const job of jobs) {
    const current = bestByTask.get(job.taskId);
    if (!current || comparePrimaryJobs(job, current) < 0) {
      bestByTask.set(job.taskId, job);
    }
  }

  return Array.from(bestByTask.values()).sort(comparePrimaryJobs);
}

export function mapPrimaryJobsByTask(jobs: JobView[]): Record<string, JobView> {
  const map: Record<string, JobView> = {};
  for (const job of pickPrimaryJobs(jobs)) {
    map[job.taskId] = job;
  }
  return map;
}
