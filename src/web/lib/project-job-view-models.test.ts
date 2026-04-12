import { describe, expect, it } from 'vitest';
import { buildJobViews } from './project-job-view-models';
import type { JobRecord } from '../components/job-types';

function makeJobRecord(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-1',
    task_id: 'task-1',
    project_id: 'project-1',
    status: 'running',
    current_phase: 'plan',
    phases_completed: [],
    attempt: 1,
    max_attempts: 3,
    started_at: null,
    review_result: null,
    completed_at: null,
    question: null,
    flow_snapshot: null,
    local_path: '/project',
    flow_id: null,
    ...overrides,
  } as JobRecord;
}

describe('buildJobViews', () => {
  it('derives phases from recorded job state when no flow snapshot exists', () => {
    const views = buildJobViews([
      {
        id: 'job-1',
        task_id: 'task-1',
        status: 'running',
        current_phase: 'implement',
        phases_completed: ['plan'],
        attempt: 1,
        max_attempts: 3,
        started_at: null,
        review_result: null,
        completed_at: null,
        question: null,
        flow_snapshot: null,
      } as unknown as Parameters<typeof buildJobViews>[0][number],
    ], {
      'task-1': 'Task 1',
    });

    expect(views[0]?.phases).toEqual([
      { name: 'plan', status: 'completed', summary: undefined },
      { name: 'implement', status: 'current' },
    ]);
  });

  it('preserves the current phase even when it is missing from the flow snapshot', () => {
    const views = buildJobViews([
      {
        id: 'job-2',
        task_id: 'task-2',
        status: 'running',
        current_phase: 'verify',
        phases_completed: ['plan'],
        attempt: 1,
        max_attempts: 3,
        started_at: null,
        review_result: null,
        completed_at: null,
        question: null,
        flow_snapshot: {
          flow_name: 'Flow',
          agents_md: null,
          steps: [
            { name: 'plan' },
            { name: 'implement' },
          ],
        },
      } as unknown as Parameters<typeof buildJobViews>[0][number],
    ], {
      'task-2': 'Task 2',
    });

    expect(views[0]?.phases).toEqual([
      { name: 'plan', status: 'completed', summary: undefined },
      { name: 'implement', status: 'pending' },
      { name: 'verify', status: 'current' },
    ]);
  });

  it('sorts jobs by status priority: running > queued > paused > review > done > failed', () => {
    const jobs = [
      makeJobRecord({ id: 'j-done', status: 'done' }),
      makeJobRecord({ id: 'j-running', status: 'running' }),
      makeJobRecord({ id: 'j-failed', status: 'failed' }),
      makeJobRecord({ id: 'j-queued', status: 'queued' }),
      makeJobRecord({ id: 'j-review', status: 'review' }),
    ];
    const views = buildJobViews(jobs, { 'task-1': 'T' });
    expect(views.map(v => v.id)).toEqual([
      'j-running', 'j-queued', 'j-review', 'j-done', 'j-failed',
    ]);
  });

  it('maps review_result to the review object with snake_case fallbacks', () => {
    const views = buildJobViews([
      makeJobRecord({
        status: 'review',
        review_result: {
          files_changed: 3,
          tests_passed: true,
          lines_added: 42,
          lines_removed: 7,
          summary: '[done] Phase complete\nActual summary line\n[codex] tokens\n\nSecond line',
          changed_files: ['a.ts', 'b.ts'],
        } as unknown as JobRecord['review_result'],
      }),
    ], { 'task-1': 'T' });

    const review = views[0]?.review;
    expect(review).toBeDefined();
    expect(review?.filesChanged).toBe(3);
    expect(review?.testsPassed).toBe(true);
    expect(review?.linesAdded).toBe(42);
    expect(review?.linesRemoved).toBe(7);
    expect(review?.summary).toBe('Actual summary line\nSecond line');
    expect(review?.changedFiles).toEqual(['a.ts', 'b.ts']);
  });

  it('leaves testsPassed undefined when neither snake_case nor camelCase field is present', () => {
    const views = buildJobViews([
      makeJobRecord({
        status: 'review',
        review_result: { summary: 'ok' } as unknown as JobRecord['review_result'],
      }),
    ], { 'task-1': 'T' });

    expect(views[0]?.review?.testsPassed).toBeUndefined();
    expect(views[0]?.review?.filesChanged).toBe(0);
    expect(views[0]?.review?.linesAdded).toBe(0);
    expect(views[0]?.review?.linesRemoved).toBe(0);
  });

  it('falls back to "Task" when the task title is missing from the map', () => {
    const views = buildJobViews([makeJobRecord()], {});
    expect(views[0]?.title).toBe('Task');
  });

  it('returns an empty array for empty jobs input', () => {
    expect(buildJobViews([], {})).toEqual([]);
  });

  it('omits review when review_result is null', () => {
    const views = buildJobViews([makeJobRecord({ review_result: null })], { 'task-1': 'T' });
    expect(views[0]?.review).toBeUndefined();
  });
});
