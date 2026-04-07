// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artifact } from '../lib/api';
import { clearArtifactCacheForTests, useArtifacts } from './useArtifacts';
import type { ProjectEvent } from './useProjectEvents';

const { getArtifactsMock, uploadArtifactMock, subscribeProjectEventsMock } = vi.hoisted(() => ({
  getArtifactsMock: vi.fn(),
  uploadArtifactMock: vi.fn(),
  subscribeProjectEventsMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getArtifacts: getArtifactsMock,
  uploadArtifact: uploadArtifactMock,
  deleteArtifact: vi.fn(),
}));

vi.mock('./useProjectEvents', () => ({
  subscribeProjectEvents: subscribeProjectEventsMock,
}));

describe('useArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearArtifactCacheForTests();
    subscribeProjectEventsMock.mockReturnValue(() => {});
  });

  it('reuses cached artifacts across remounts without refetching', async () => {
    getArtifactsMock.mockResolvedValue([makeArtifact('file-1')]);
    const first = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect(first.result.current.artifacts).toHaveLength(1);
    expect(getArtifactsMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useArtifacts('task-1', 'project-1'));

    expect(second.result.current.loaded).toBe(true);
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.artifacts[0].id).toBe('file-1');
    expect(getArtifactsMock).toHaveBeenCalledTimes(1);
  });

  it('force-reloads cached artifacts on artifact project events', async () => {
    const callbacks: Array<(event: ProjectEvent) => void> = [];
    subscribeProjectEventsMock.mockImplementation((_projectId: string, cb: (event: ProjectEvent) => void) => {
      callbacks.push(cb);
      return () => {};
    });
    getArtifactsMock
      .mockResolvedValueOnce([makeArtifact('file-1')])
      .mockResolvedValueOnce([makeArtifact('file-2')]);
    const { result } = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(result.current.artifacts[0]?.id).toBe('file-1'));

    await act(async () => {
      callbacks[0]({ type: 'artifact_changed', task_id: 'task-1' });
    });

    await waitFor(() => expect(result.current.artifacts[0]?.id).toBe('file-2'));
    expect(getArtifactsMock).toHaveBeenCalledTimes(2);
  });

  it('publishes cache updates to other mounted artifact consumers', async () => {
    getArtifactsMock
      .mockResolvedValueOnce([makeArtifact('file-1')])
      .mockResolvedValueOnce([makeArtifact('file-2')]);
    uploadArtifactMock.mockResolvedValue(undefined);
    const first = renderHook(() => useArtifacts('task-1', 'project-1'));
    const second = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(first.result.current.artifacts[0]?.id).toBe('file-1'));
    expect(second.result.current.artifacts[0]?.id).toBe('file-1');

    await act(async () => {
      await first.result.current.upload(new File(['updated'], 'updated.md', { type: 'text/markdown' }));
    });

    await waitFor(() => expect(second.result.current.artifacts[0]?.id).toBe('file-2'));
    expect(getArtifactsMock).toHaveBeenCalledTimes(2);
  });
});

function makeArtifact(id: string): Artifact {
  return {
    id,
    task_id: 'task-1',
    job_id: null,
    phase: null,
    filename: `${id}.md`,
    mime_type: 'text/markdown',
    size_bytes: 20,
    storage_path: `${id}.md`,
    repo_path: null,
    url: `/${id}.md`,
    created_at: 'now',
  };
}
