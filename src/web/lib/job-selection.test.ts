import { describe, expect, it } from 'vitest';
import { mapPrimaryJobsByTask, pickPrimaryJobs } from './job-selection';
import type { JobView } from '../components/job-types';

function makeJob(overrides: Partial<JobView> & Pick<JobView, 'id' | 'taskId' | 'status'>): JobView {
  return {
    id: overrides.id,
    taskId: overrides.taskId,
    title: overrides.title ?? 'Task',
    type: overrides.type ?? 'task',
    status: overrides.status,
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    question: overrides.question,
    review: overrides.review,
  };
}

describe('job selection', () => {
  it('keeps only the highest-priority job per task', () => {
    const jobs = pickPrimaryJobs([
      makeJob({ id: 'done-1', taskId: 'task-1', status: 'done', completedAt: '2026-04-06T10:00:00Z' }),
      makeJob({ id: 'paused-1', taskId: 'task-1', status: 'paused', startedAt: '2026-04-06T09:00:00Z' }),
      makeJob({ id: 'review-2', taskId: 'task-2', status: 'review', startedAt: '2026-04-06T08:00:00Z' }),
    ]);

    expect(jobs.map(job => [job.taskId, job.status])).toEqual([
      ['task-1', 'paused'],
      ['task-2', 'review'],
    ]);
  });

  it('breaks ties by most recent activity when statuses match', () => {
    const jobs = pickPrimaryJobs([
      makeJob({ id: 'paused-old', taskId: 'task-1', status: 'paused', startedAt: '2026-04-06T08:00:00Z' }),
      makeJob({ id: 'paused-new', taskId: 'task-1', status: 'paused', startedAt: '2026-04-06T10:00:00Z' }),
      makeJob({ id: 'review-old', taskId: 'task-2', status: 'review', completedAt: '2026-04-06T07:00:00Z' }),
      makeJob({ id: 'review-new', taskId: 'task-2', status: 'review', completedAt: '2026-04-06T11:00:00Z' }),
    ]);

    expect(jobs.map(job => job.id)).toEqual(['paused-new', 'review-new']);
  });

  it('returns an empty array for empty input', () => {
    expect(pickPrimaryJobs([])).toEqual([]);
  });

  it('uses id as a stable tiebreak when status and timestamps match', () => {
    const jobs = pickPrimaryJobs([
      makeJob({ id: 'b', taskId: 'task-1', status: 'review' }),
      makeJob({ id: 'a', taskId: 'task-1', status: 'review' }),
    ]);
    expect(jobs[0]?.id).toBe('a');
  });

  it('treats invalid timestamp strings as zero (no crash)', () => {
    const jobs = pickPrimaryJobs([
      makeJob({ id: 'j-1', taskId: 'task-1', status: 'done', completedAt: 'not-a-date' }),
      makeJob({ id: 'j-2', taskId: 'task-1', status: 'done', completedAt: '2026-04-06T10:00:00Z' }),
    ]);
    expect(jobs[0]?.id).toBe('j-2');
  });

  it('builds a stable task-id lookup for board consumers', () => {
    const map = mapPrimaryJobsByTask([
      makeJob({ id: 'failed-1', taskId: 'task-1', status: 'failed', startedAt: '2026-04-06T07:00:00Z' }),
      makeJob({ id: 'running-1', taskId: 'task-1', status: 'running', startedAt: '2026-04-06T09:00:00Z' }),
      makeJob({ id: 'done-2', taskId: 'task-2', status: 'done', completedAt: '2026-04-06T06:00:00Z' }),
    ]);

    expect(map['task-1']?.id).toBe('running-1');
    expect(map['task-2']?.id).toBe('done-2');
  });
});
