import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => {
  const state: {
    defaultFlows: unknown[];
    singleFlow: unknown;
    singleError: unknown;
  } = { defaultFlows: [], singleFlow: null, singleError: null };
  const limit = vi.fn(async () => ({ data: state.defaultFlows, error: null }));
  const single = vi.fn(async () => ({ data: state.singleFlow, error: state.singleError }));
  const order = vi.fn(() => ({ order, limit }));
  const contains = vi.fn(() => ({ order, limit }));
  const eq = vi.fn(() => ({ eq, contains, order, limit, single }));
  const select = vi.fn(() => ({ eq, contains, order, limit, single }));
  const from = vi.fn(() => ({ select }));
  return { from, state };
});

vi.mock('./supabase.js', () => ({
  supabase: {
    from: supabaseMock.from,
  },
}));

vi.mock('./flow-config.js', () => ({
  buildFlowSnapshot: vi.fn((flow: any) => ({
    flow_name: flow.name || 'Flow',
    agents_md: null,
    steps: flow.steps ?? [{ name: 'plan', max_retries: 0 }],
  })),
}));

import { findDefaultFlowId, resolveFlowForTask } from './flow-resolution.js';

function resetSupabaseState() {
  supabaseMock.state.defaultFlows = [];
  supabaseMock.state.singleFlow = null;
  supabaseMock.state.singleError = null;
  vi.clearAllMocks();
}

describe('findDefaultFlowId', () => {
  beforeEach(resetSupabaseState);

  it('returns null when no default flow exists for the task type', async () => {
    await expect(findDefaultFlowId('project-1', 'feature')).resolves.toBeNull();
  });

  it('returns the matching flow id when exactly one default flow exists', async () => {
    supabaseMock.state.defaultFlows = [{ id: 'flow-1' }];

    await expect(findDefaultFlowId('project-1', 'feature')).resolves.toBe('flow-1');
  });

  it('rejects ambiguous default flow bindings', async () => {
    supabaseMock.state.defaultFlows = [{ id: 'flow-1' }, { id: 'flow-2' }];

    await expect(findDefaultFlowId('project-1', 'feature')).rejects.toThrow(
      'Multiple default flows are configured for task type "feature"',
    );
  });
});

describe('resolveFlowForTask', () => {
  beforeEach(resetSupabaseState);

  it('resolves a task with an explicit flow_id by loading that flow', async () => {
    supabaseMock.state.singleFlow = { id: 'flow-1', name: 'Coding' };

    const result = await resolveFlowForTask({ flow_id: 'flow-1', type: 'feature' }, 'project-1');

    expect(result.flowId).toBe('flow-1');
    expect(result.firstPhase).toBe('plan');
    expect(result.maxAttempts).toBe(1);
    expect(result.flowSnapshot.flow_name).toBe('Coding');
  });

  it('throws when the explicit flow_id is not found', async () => {
    supabaseMock.state.singleFlow = null;
    supabaseMock.state.singleError = { code: 'PGRST116', message: 'no rows' };

    await expect(
      resolveFlowForTask({ flow_id: 'missing-flow', type: 'feature' }, 'project-1'),
    ).rejects.toThrow('Assigned flow missing-flow was not found');
  });

  it('falls back to the default type flow when flow_id is null', async () => {
    supabaseMock.state.defaultFlows = [{ id: 'default-flow', name: 'Default' }];

    const result = await resolveFlowForTask({ flow_id: null, type: 'feature' }, 'project-1');

    expect(result.flowId).toBe('default-flow');
    expect(result.flowSnapshot.flow_name).toBe('Default');
  });

  it('throws when no flow is assigned and no default exists', async () => {
    await expect(
      resolveFlowForTask({ flow_id: null, type: 'feature' }, 'project-1'),
    ).rejects.toThrow('AI tasks require an assigned flow');
  });

  it('computes maxAttempts as the max (retries + 1) across all steps', async () => {
    supabaseMock.state.singleFlow = {
      id: 'flow-1',
      name: 'Multi',
      steps: [
        { name: 'plan', max_retries: 1 },
        { name: 'code', max_retries: 3 },
        { name: 'review', max_retries: 0 },
      ],
    };

    const result = await resolveFlowForTask({ flow_id: 'flow-1', type: 'feature' }, 'project-1');

    expect(result.maxAttempts).toBe(4);
    expect(result.firstPhase).toBe('plan');
  });

  it('defaults firstPhase to "plan" and maxAttempts to 1 when steps are empty', async () => {
    supabaseMock.state.singleFlow = { id: 'flow-1', name: 'Empty', steps: [] };

    const result = await resolveFlowForTask({ flow_id: 'flow-1', type: 'feature' }, 'project-1');

    expect(result.firstPhase).toBe('plan');
    expect(result.maxAttempts).toBe(1);
  });
});
