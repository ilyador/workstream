import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => {
  const state: { defaultFlows: unknown[] } = { defaultFlows: [] };
  const limit = vi.fn(async () => ({ data: state.defaultFlows, error: null }));
  const order = vi.fn(() => ({ order, limit }));
  const contains = vi.fn(() => ({ order, limit }));
  const eq = vi.fn(() => ({ eq, contains, order, limit }));
  const select = vi.fn(() => ({ eq, contains, order, limit }));
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
    steps: [{ name: 'plan', max_retries: 0 }],
  })),
}));

import { findDefaultFlowId } from './flow-resolution.js';

describe('findDefaultFlowId', () => {
  beforeEach(() => {
    supabaseMock.state.defaultFlows = [];
    vi.clearAllMocks();
  });

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
