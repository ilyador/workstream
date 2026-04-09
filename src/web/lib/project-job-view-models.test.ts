import { describe, expect, it } from 'vitest';
import { buildJobViews } from './project-job-view-models';

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
});
