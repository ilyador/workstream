import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoContinueTask } from './auto-continue-types.js';

const callOrder: string[] = [];

const supabaseMock = vi.hoisted(() => {
  const order: string[] = [];
  const state: {
    taskUpdateData: unknown;
    taskUpdateError: unknown;
    jobInsertData: unknown;
    jobInsertError: unknown;
    jobRollbackError: unknown;
    taskRollbackError: unknown;
  } = {
    taskUpdateData: null,
    taskUpdateError: null,
    jobInsertData: null,
    jobInsertError: null,
    jobRollbackError: null,
    taskRollbackError: null,
  };

  const maybeSingle = vi.fn(async () => {
    // Used for task update result
    return { data: state.taskUpdateData, error: state.taskUpdateError };
  });

  const single = vi.fn(async () => {
    // Used for job insert result
    return { data: state.jobInsertData, error: state.jobInsertError };
  });

  const eq = vi.fn(function (this: any) { return this; });
  const inFilter = vi.fn(function (this: any) { return this; });
  const select = vi.fn(function (this: any, _cols?: string) {
    return { ...this, single, maybeSingle };
  });
  const insert = vi.fn(function (this: any) { return { ...this, select }; });
  const update = vi.fn(function (this: any) { return { ...this, eq, in: inFilter, select }; });
  const deleteFn = vi.fn(async () => ({ error: state.jobRollbackError }));
  const deleteMethod = vi.fn(function (this: any) {
    return { eq: vi.fn(() => deleteFn()) };
  });

  const from = vi.fn((table: string) => {
    order.push(table);
    const chain: any = {};
    chain.eq = eq.mockImplementation(() => chain);
    chain.in = inFilter.mockImplementation(() => chain);
    chain.select = select.mockImplementation((_cols?: string) => ({
      ...chain,
      single,
      maybeSingle,
    }));
    chain.insert = insert.mockImplementation(() => ({ ...chain, select: chain.select }));
    chain.update = update.mockImplementation(() => ({
      ...chain,
      eq: chain.eq,
      in: chain.in,
      select: chain.select,
    }));
    chain.delete = deleteMethod.mockImplementation(() => ({
      eq: vi.fn(() => deleteFn()),
    }));
    return chain;
  });

  return { from, state, order, single, maybeSingle, eq, inFilter, select, insert, update, deleteFn };
});

vi.mock('./supabase.js', () => ({
  supabase: {
    from: supabaseMock.from,
  },
}));

vi.mock('./flow-resolution.js', () => ({
  resolveFlowForTask: vi.fn(async () => ({
    flowId: 'flow-1',
    firstPhase: 'plan',
    maxAttempts: 1,
    flowSnapshot: { flow_name: 'Test Flow', agents_md: null, steps: [{ name: 'plan', max_retries: 0 }] },
  })),
}));

import { queueAiTask } from './auto-continue-queue.js';

const fakeTask: AutoContinueTask = {
  id: 'task-1',
  project_id: 'project-1',
  type: 'feature',
  mode: null,
  title: 'Test task',
  assignee: null,
  created_by: null,
  flow_id: 'flow-1',
};

describe('queueAiTask', () => {
  beforeEach(() => {
    supabaseMock.order.length = 0;
    supabaseMock.state.taskUpdateData = { id: 'task-1' };
    supabaseMock.state.taskUpdateError = null;
    supabaseMock.state.jobInsertData = { id: 'job-1' };
    supabaseMock.state.jobInsertError = null;
    supabaseMock.state.jobRollbackError = null;
    supabaseMock.state.taskRollbackError = null;
    vi.clearAllMocks();
  });

  it('updates the task to in_progress BEFORE inserting the job', async () => {
    const result = await queueAiTask({
      task: fakeTask,
      projectId: 'project-1',
      localPath: '/tmp/test',
    });

    expect(result).toBe('job-1');
    const tasksIdx = supabaseMock.order.indexOf('tasks');
    const jobsIdx = supabaseMock.order.indexOf('jobs');
    expect(tasksIdx).toBeGreaterThanOrEqual(0);
    expect(jobsIdx).toBeGreaterThanOrEqual(0);
    expect(tasksIdx).toBeLessThan(jobsIdx);
  });

  it('does not insert a job when the task update matches zero rows', async () => {
    supabaseMock.state.taskUpdateData = null;
    supabaseMock.state.taskUpdateError = null;

    const result = await queueAiTask({
      task: fakeTask,
      projectId: 'project-1',
      localPath: '/tmp/test',
    });

    expect(result).toBeNull();
    expect(supabaseMock.order).not.toContain('jobs');
  });
});
