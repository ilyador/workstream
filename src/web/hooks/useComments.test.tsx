// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCommentCacheForTests, type Comment, useComments } from './useComments';
import type { ProjectEvent } from './useProjectEvents';

const { addCommentMock, deleteCommentMock, getCommentsMock, subscribeProjectEventsMock } = vi.hoisted(() => ({
  addCommentMock: vi.fn(),
  deleteCommentMock: vi.fn(),
  getCommentsMock: vi.fn(),
  subscribeProjectEventsMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getComments: getCommentsMock,
  addComment: addCommentMock,
  deleteComment: deleteCommentMock,
}));

vi.mock('./useProjectEvents', () => ({
  subscribeProjectEvents: subscribeProjectEventsMock,
}));

describe('useComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCommentCacheForTests();
    subscribeProjectEventsMock.mockReturnValue(() => {});
  });

  it('reuses cached comments across remounts without refetching', async () => {
    getCommentsMock.mockResolvedValue([makeComment('comment-1')]);
    const first = renderHook(() => useComments('task-1', 'project-1'));

    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect(first.result.current.comments).toHaveLength(1);
    expect(getCommentsMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useComments('task-1', 'project-1'));

    expect(second.result.current.loaded).toBe(true);
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.comments[0].id).toBe('comment-1');
    expect(getCommentsMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch comments on generic full sync events', async () => {
    const callbacks: Array<(event: ProjectEvent) => void> = [];
    subscribeProjectEventsMock.mockImplementation((_projectId: string, cb: (event: ProjectEvent) => void) => {
      callbacks.push(cb);
      return () => {};
    });
    getCommentsMock.mockResolvedValue([makeComment('comment-1')]);
    const { result } = renderHook(() => useComments('task-1', 'project-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      callbacks[0]({ type: 'full_sync' });
    });

    expect(getCommentsMock).toHaveBeenCalledTimes(1);
  });

  it('force-reloads cached comments on task comment events', async () => {
    const callbacks: Array<(event: ProjectEvent) => void> = [];
    subscribeProjectEventsMock.mockImplementation((_projectId: string, cb: (event: ProjectEvent) => void) => {
      callbacks.push(cb);
      return () => {};
    });
    getCommentsMock
      .mockResolvedValueOnce([makeComment('comment-1')])
      .mockResolvedValueOnce([makeComment('comment-2')]);
    const { result } = renderHook(() => useComments('task-1', 'project-1'));

    await waitFor(() => expect(result.current.comments[0]?.id).toBe('comment-1'));

    await act(async () => {
      callbacks[0]({ type: 'comment_changed', task_id: 'task-1' });
    });

    await waitFor(() => expect(result.current.comments[0]?.id).toBe('comment-2'));
    expect(getCommentsMock).toHaveBeenCalledTimes(2);
  });

  it('does not let stale in-flight loads overwrite a newer force reload', async () => {
    const initial = deferred<Comment[]>();
    const forced = deferred<Comment[]>();
    getCommentsMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(forced.promise);
    const { result } = renderHook(() => useComments('task-1', 'project-1'));

    await waitFor(() => expect(getCommentsMock).toHaveBeenCalledTimes(1));
    const reloadPromise = act(async () => {
      const pendingReload = result.current.reload({ force: true });
      forced.resolve([makeComment('fresh-comment')]);
      await pendingReload;
    });
    await reloadPromise;
    expect(result.current.comments[0]?.id).toBe('fresh-comment');

    await act(async () => {
      initial.resolve([makeComment('stale-comment')]);
      await initial.promise;
    });

    expect(result.current.comments[0]?.id).toBe('fresh-comment');
  });
});

function makeComment(id: string): Comment {
  return {
    id,
    task_id: 'task-1',
    user_id: 'user-1',
    body: `${id} body`,
    created_at: '2026-04-07T10:00:00.000Z',
    profiles: { name: 'A User', initials: 'AU' },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
