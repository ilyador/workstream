// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkstreamRecord } from '../lib/api';
import { useWorkstreams } from './useWorkstreams';
import type { ProjectEvent } from './useProjectEvents';

const { getWorkstreamsMock, subscribeProjectEventsMock } = vi.hoisted(() => ({
  getWorkstreamsMock: vi.fn(),
  subscribeProjectEventsMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getWorkstreams: getWorkstreamsMock,
  createWorkstream: vi.fn(),
  updateWorkstream: vi.fn(),
  deleteWorkstream: vi.fn(),
}));

vi.mock('./useProjectEvents', () => ({
  subscribeProjectEvents: subscribeProjectEventsMock,
}));

describe('useWorkstreams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeProjectEventsMock.mockReturnValue(() => {});
  });

  it('removes workstreams on workstream_deleted project events', async () => {
    const callbacks: Array<(event: ProjectEvent) => void> = [];
    subscribeProjectEventsMock.mockImplementation((_projectId: string, cb: (event: ProjectEvent) => void) => {
      callbacks.push(cb);
      return () => {};
    });
    getWorkstreamsMock.mockResolvedValue([makeWorkstream('ws-1', 0), makeWorkstream('ws-2', 1)]);

    const { result } = renderHook(() => useWorkstreams('project-1'));
    await waitFor(() => expect(result.current.workstreams.map(ws => ws.id)).toEqual(['ws-1', 'ws-2']));

    await act(async () => {
      callbacks[0]({ type: 'workstream_deleted', workstream_id: 'ws-1' });
    });

    expect(result.current.workstreams.map(ws => ws.id)).toEqual(['ws-2']);
    expect(getWorkstreamsMock).toHaveBeenCalledTimes(1);
  });
});

function makeWorkstream(id: string, position: number): WorkstreamRecord {
  return {
    id,
    project_id: 'project-1',
    name: id,
    description: '',
    has_code: true,
    status: 'active',
    position,
    pr_url: null,
    reviewer_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}
