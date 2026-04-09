import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  queuedJobs: [] as Array<{ id: string; local_path: string | null }>,
  updatedJobs: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  deletedQueuedJobs: false,
  resolvedFlow: {
    flowId: 'flow-next' as string | null,
    firstPhase: 'implement',
    maxAttempts: 3,
    flowSnapshot: {
      flow_name: 'Developer',
      agents_md: null,
      provider_binding: 'task_selected' as const,
      steps: [],
    },
  },
}));

vi.mock('./flow-resolution.js', () => ({
  resolveFlowForTask: vi.fn(async () => state.resolvedFlow),
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table !== 'jobs') throw new Error(`Unexpected table: ${table}`);

      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === 'status' && value === 'queued') {
            return Promise.resolve({ data: state.queuedJobs, error: null });
          }
          return selectChain;
        }),
      };

      return {
        ...selectChain,
        delete: vi.fn(() => ({
          eq: vi.fn((column: string, value: unknown) => ({
            eq: vi.fn(async (statusColumn: string, statusValue: unknown) => {
              if (column === 'task_id' && typeof value === 'string' && statusColumn === 'status' && statusValue === 'queued') {
                state.deletedQueuedJobs = true;
                return { error: null };
              }
              throw new Error('Unexpected delete chain');
            }),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn(async (column: string, value: unknown) => {
            if (column !== 'id' || typeof value !== 'string') throw new Error('Unexpected update chain');
            state.updatedJobs.push({ id: value, payload });
            return { error: null };
          }),
        })),
      };
    }),
  },
}));

import { syncQueuedJobsForTask } from './queued-job-sync.js';

describe('syncQueuedJobsForTask', () => {
  beforeEach(() => {
    state.queuedJobs = [
      { id: 'job-1', local_path: '/tmp/project' },
      { id: 'job-2', local_path: '/tmp/project-2' },
    ];
    state.updatedJobs = [];
    state.deletedQueuedJobs = false;
    state.resolvedFlow = {
      flowId: 'flow-next',
      firstPhase: 'implement',
      maxAttempts: 3,
      flowSnapshot: {
        flow_name: 'Developer',
        agents_md: null,
        provider_binding: 'task_selected',
        steps: [],
      },
    };
  });

  it('refreshes queued job previews for AI tasks', async () => {
    await syncQueuedJobsForTask({
      projectId: 'project-1',
      task: {
        id: 'task-1',
        execution_generation: 1,
        type: 'feature',
        mode: 'ai',
        assignee: null,
        flow_id: 'flow-next',
      },
    });

    expect(state.deletedQueuedJobs).toBe(false);
    expect(state.updatedJobs).toEqual([
      {
        id: 'job-1',
        payload: {
          flow_id: 'flow-next',
          current_phase: 'implement',
          max_attempts: 3,
          flow_snapshot: state.resolvedFlow.flowSnapshot,
          requested_generation: 1,
        },
      },
      {
        id: 'job-2',
        payload: {
          flow_id: 'flow-next',
          current_phase: 'implement',
          max_attempts: 3,
          flow_snapshot: state.resolvedFlow.flowSnapshot,
          requested_generation: 1,
        },
      },
    ]);
  });

  it('discards queued jobs when the task is no longer AI-runnable', async () => {
    await syncQueuedJobsForTask({
      projectId: 'project-1',
      task: {
        id: 'task-1',
        type: 'feature',
        mode: 'human',
        assignee: 'user-1',
      },
    });

    expect(state.deletedQueuedJobs).toBe(true);
    expect(state.updatedJobs).toEqual([]);
  });

  it('discards queued jobs when an AI task no longer has an assigned flow', async () => {
    await syncQueuedJobsForTask({
      projectId: 'project-1',
      task: {
        id: 'task-1',
        mode: 'ai',
        status: 'todo',
        assignee: null,
        flow_id: null,
      },
    });

    expect(state.deletedQueuedJobs).toBe(true);
    expect(state.updatedJobs).toEqual([]);
  });
});
