import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProviderTaskConfig } from '../shared/provider-task-config.js';

const state = vi.hoisted(() => ({
  taskRow: {
    id: 'task-1',
    active_job_id: null as string | null,
    execution_generation: 1,
    mode: 'ai',
    status: 'todo',
    assignee: null as string | null,
    execution_settings_locked_at: null as string | null,
    execution_settings_locked_job_id: null as string | null,
  },
  flowRow: {
    provider_binding: 'task_selected',
    flow_steps: [
      {
        name: 'implement',
        model: 'task:selected',
        tools: ['Read'],
        context_sources: ['task_description'],
      },
    ],
  },
  providerConfigs: [] as Array<Record<string, unknown>>,
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'flows') {
        const selectChain = {
          select: vi.fn(() => selectChain),
          eq: vi.fn(() => selectChain),
          maybeSingle: vi.fn(async () => ({ data: state.flowRow, error: null })),
        };
        return selectChain;
      }
      if (table !== 'tasks') throw new Error(`Unexpected table: ${table}`);

      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn(() => selectChain),
        single: vi.fn(async () => ({ data: state.taskRow, error: null })),
      };

      return {
        ...selectChain,
        update: vi.fn((payload: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const updateChain = {
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return updateChain;
            }),
            is: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return updateChain;
            }),
            in: vi.fn((column: string, values: unknown[]) => {
              filters[column] = values;
              return updateChain;
            }),
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                state.taskRow = { ...state.taskRow, ...payload };
                return { data: state.taskRow, error: null };
              }),
              maybeSingle: vi.fn(async () => {
                if (filters.id !== state.taskRow.id) return { data: null, error: null };
                if (filters.mode != null && filters.mode !== state.taskRow.mode) {
                  return { data: null, error: null };
                }
                if (filters.execution_generation != null && filters.execution_generation !== state.taskRow.execution_generation) {
                  return { data: null, error: null };
                }
                if (Array.isArray(filters.status) && !filters.status.includes(state.taskRow.status)) {
                  return { data: null, error: null };
                }
                if ('assignee' in filters && state.taskRow.assignee !== filters.assignee) {
                  return { data: null, error: null };
                }
                if ('active_job_id' in filters && state.taskRow.active_job_id !== filters.active_job_id) {
                  return { data: null, error: null };
                }
                state.taskRow = { ...state.taskRow, ...payload };
                return { data: state.taskRow, error: null };
              }),
            })),
          };
          return updateChain;
        }),
      };
    }),
  },
}));

vi.mock('./providers/registry.js', () => ({
  getProjectProviderConfigs: vi.fn(async () => state.providerConfigs),
  getProviderConfigById: vi.fn(async (_projectId: string, providerConfigId: string) => (
    state.providerConfigs.find(config => config.id === providerConfigId) ?? null
  )),
}));

import {
  ensureTaskExecutionJobOwnership,
  isQueueableTask,
  lockTaskExecutionSettings,
  resolveFreshFlowSnapshotForTask,
  resolveTaskExecutionSelection,
} from './task-execution.js';

describe('task execution lock ownership', () => {
  beforeEach(() => {
    state.taskRow = {
      id: 'task-1',
      active_job_id: null,
      execution_generation: 1,
      mode: 'ai',
      status: 'todo',
      assignee: null,
      execution_settings_locked_at: null,
      execution_settings_locked_job_id: null,
    };
    state.flowRow = {
      provider_binding: 'task_selected',
      flow_steps: [
        {
          name: 'implement',
          model: 'task:selected',
          tools: ['Read'],
          context_sources: ['task_description'],
        },
      ],
    };
    state.providerConfigs = [];
  });

  it('locks a task to the starting job and preserves the original lock timestamp on resume', async () => {
    const locked = await lockTaskExecutionSettings('task-1', 'job-1', 1);
    const lockedAt = locked.execution_settings_locked_at;

    expect(locked.execution_settings_locked_job_id).toBe('job-1');
    expect(locked.status).toBe('in_progress');
    expect(typeof lockedAt).toBe('string');

    const resumed = await lockTaskExecutionSettings('task-1', 'job-1', 1);
    expect(resumed.execution_settings_locked_job_id).toBe('job-1');
    expect(resumed.execution_settings_locked_at).toBe(lockedAt);
  });

  it('adopts legacy lock rows for the same job when ownership was not recorded yet', async () => {
    state.taskRow = {
      id: 'task-1',
      active_job_id: null,
      execution_generation: 1,
      mode: 'ai',
      status: 'paused',
      assignee: null,
      execution_settings_locked_at: '2026-04-08T10:00:00.000Z',
      execution_settings_locked_job_id: null,
    };

    const adopted = await ensureTaskExecutionJobOwnership('task-1', 'job-1');
    expect(adopted.execution_settings_locked_job_id).toBe('job-1');
  });

  it('rejects continuing a job after the task was reset', async () => {
    await expect(ensureTaskExecutionJobOwnership('task-1', 'job-1')).rejects.toThrow(
      'This task was reset after the job started. Start a new run instead of continuing the old job.',
    );
  });

  it('does not consider AI tasks without an assigned flow queueable', () => {
    expect(isQueueableTask({
      mode: 'ai',
      status: 'todo',
      assignee: null,
      flow_id: null,
    })).toBe(false);
  });

  it('fails fast when trying to resolve a fresh snapshot for a task without a flow', async () => {
    await expect(resolveFreshFlowSnapshotForTask({
      projectId: 'project-1',
      task: {
        id: 'task-1',
        mode: 'ai',
        status: 'todo',
        assignee: null,
        flow_id: null,
      },
    })).rejects.toThrow('AI tasks require an assigned flow');
  });

  it('does not lock tasks that are no longer queueable', async () => {
    state.taskRow = {
      ...state.taskRow,
      status: 'review',
    };

    const locked = await lockTaskExecutionSettings('task-1', 'job-1', 1);

    expect(locked).toBeNull();
    expect(state.taskRow.active_job_id).toBeNull();
    expect(state.taskRow.status).toBe('review');
  });

  it('requires an explicit provider when multiple compatible providers satisfy the flow', async () => {
    state.providerConfigs = [
      {
        id: 'provider-claude',
        project_id: 'project-1',
        provider: 'claude',
        label: 'Claude CLI',
        base_url: null,
        api_key: null,
        is_enabled: true,
        supports_embeddings: false,
        embedding_model: null,
        task_config: defaultProviderTaskConfig('claude'),
      },
      {
        id: 'provider-codex',
        project_id: 'project-1',
        provider: 'codex',
        label: 'Codex CLI',
        base_url: null,
        api_key: null,
        is_enabled: true,
        supports_embeddings: false,
        embedding_model: null,
        task_config: defaultProviderTaskConfig('codex'),
      },
    ];

    await expect(resolveTaskExecutionSelection('project-1', {
      mode: 'ai',
      assignee: null,
      flow_id: 'flow-1',
      provider_config_id: null,
      provider_model: null,
    })).rejects.toThrow('Multiple enabled providers satisfy this flow. Pick one explicitly.');
  });
});
