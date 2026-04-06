import { useEffect } from 'react';
import { getCommentCounts } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useCommentCounts(projectId: string | null) {
  const {
    data: counts,
    setData: setCounts,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, getCommentCounts, {
    createInitialValue: () => ({}),
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load comment counts',
  });

  useEffect(() => {
    void load();
    if (!projectId) return;
    // Reload when tasks change (comments might have been added)
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'task_changed' || event.type === 'comment_changed' || event.type === 'comment_deleted' || event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [projectId, load]);

  return { counts, setCounts, loading, error, ready, reload: load };
}
