// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useProjectResource } from './useProjectResource';

describe('useProjectResource', () => {
  it('does not reset loaded data when callers recreate loader/options functions', async () => {
    const loader = vi.fn(async (projectId: string) => [`loaded:${projectId}`]);
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | null }) => useProjectResource(projectId, loader, {
        createInitialValue: () => [] as string[],
        getErrorMessage: () => 'failed',
      }),
      { initialProps: { projectId: 'project-1' } },
    );

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.data).toEqual(['loaded:project-1']);
    expect(result.current.ready).toBe(true);

    rerender({ projectId: 'project-1' });

    expect(result.current.data).toEqual(['loaded:project-1']);
    expect(result.current.ready).toBe(true);
  });

  it('ignores stale loads after the project changes', async () => {
    const resolvers: Record<string, (value: string[]) => void> = {};
    const loader = vi.fn((projectId: string) => new Promise<string[]>(resolve => {
      resolvers[projectId] = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | null }) => useProjectResource(projectId, loader, {
        createInitialValue: () => [] as string[],
      }),
      { initialProps: { projectId: 'project-1' } },
    );

    let firstLoad!: Promise<string[] | undefined>;
    act(() => {
      firstLoad = result.current.reload();
    });

    rerender({ projectId: 'project-2' });

    let secondLoad!: Promise<string[] | undefined>;
    act(() => {
      secondLoad = result.current.reload();
    });

    await act(async () => {
      resolvers['project-1']?.(['stale']);
      resolvers['project-2']?.(['current']);
      await Promise.all([firstLoad, secondLoad]);
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(['current']);
    });
    expect(result.current.ready).toBe(true);
  });
});
