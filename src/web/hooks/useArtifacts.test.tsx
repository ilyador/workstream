// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artifact } from '../lib/api';
import { clearArtifactCacheForTests, useArtifacts } from './useArtifacts';
import type { ProjectEvent } from './useProjectEvents';

const { getArtifactsMock, uploadArtifactMock, deleteArtifactMock, subscribeProjectEventsMock } = vi.hoisted(() => ({
  getArtifactsMock: vi.fn(),
  uploadArtifactMock: vi.fn(),
  deleteArtifactMock: vi.fn(),
  subscribeProjectEventsMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getArtifacts: getArtifactsMock,
  uploadArtifact: uploadArtifactMock,
  deleteArtifact: deleteArtifactMock,
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

  it('does not refetch artifacts on generic full sync events', async () => {
    const callbacks: Array<(event: ProjectEvent) => void> = [];
    subscribeProjectEventsMock.mockImplementation((_projectId: string, cb: (event: ProjectEvent) => void) => {
      callbacks.push(cb);
      return () => {};
    });
    getArtifactsMock.mockResolvedValue([makeArtifact('file-1')]);
    const { result } = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      callbacks[0]({ type: 'full_sync' });
    });

    expect(getArtifactsMock).toHaveBeenCalledTimes(1);
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

  it('remove() deletes the artifact and reloads from the server', async () => {
    deleteArtifactMock.mockResolvedValue(undefined);
    getArtifactsMock
      .mockResolvedValueOnce([makeArtifact('file-1'), makeArtifact('file-2')])
      .mockResolvedValueOnce([makeArtifact('file-2')]);
    const { result } = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(result.current.artifacts).toHaveLength(2));

    await act(async () => {
      await result.current.remove('file-1');
    });

    expect(deleteArtifactMock).toHaveBeenCalledWith('file-1');
    await waitFor(() => expect(result.current.artifacts).toHaveLength(1));
    expect(result.current.artifacts[0].id).toBe('file-2');
    expect(getArtifactsMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a load error and then clears it on a successful retry', async () => {
    getArtifactsMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([makeArtifact('file-1')]);
    const { result } = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loaded).toBe(false);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.reload({ force: true });
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.loaded).toBe(true);
    expect(result.current.artifacts[0].id).toBe('file-1');
  });

  it('resets local state when taskId transitions to null', async () => {
    getArtifactsMock.mockResolvedValue([makeArtifact('file-1')]);
    const { result, rerender } = renderHook(
      ({ taskId }: { taskId: string | null }) => useArtifacts(taskId, 'project-1'),
      { initialProps: { taskId: 'task-1' as string | null } },
    );

    await waitFor(() => expect(result.current.artifacts).toHaveLength(1));

    rerender({ taskId: null });

    expect(result.current.artifacts).toEqual([]);
    expect(result.current.loaded).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('exposes stable upload and remove identities across renders when deps are unchanged', async () => {
    getArtifactsMock.mockResolvedValue([makeArtifact('file-1')]);
    const { result, rerender } = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    const firstUpload = result.current.upload;
    const firstRemove = result.current.remove;

    rerender();

    expect(result.current.upload).toBe(firstUpload);
    expect(result.current.remove).toBe(firstRemove);
  });

  it('does not let stale in-flight loads overwrite a newer force reload', async () => {
    const initial = deferred<Artifact[]>();
    const forced = deferred<Artifact[]>();
    getArtifactsMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(forced.promise);
    const { result } = renderHook(() => useArtifacts('task-1', 'project-1'));

    await waitFor(() => expect(getArtifactsMock).toHaveBeenCalledTimes(1));
    const reloadPromise = act(async () => {
      const pendingReload = result.current.reload({ force: true });
      forced.resolve([makeArtifact('fresh-file')]);
      await pendingReload;
    });
    await reloadPromise;
    expect(result.current.artifacts[0]?.id).toBe('fresh-file');

    await act(async () => {
      initial.resolve([makeArtifact('stale-file')]);
      await initial.promise;
    });

    expect(result.current.artifacts[0]?.id).toBe('fresh-file');
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
