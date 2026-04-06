import { useState, useEffect, useCallback } from 'react';
import { getCommentCounts } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

export function useCommentCounts(projectId: string | null) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await getCommentCounts(projectId);
      setCounts(data);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    load();
    if (!projectId) return;
    // Reload when tasks change (comments might have been added)
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'task_changed' || event.type === 'comment_changed' || event.type === 'comment_deleted' || event.type === 'full_sync') load();
    });
    return unsub;
  }, [projectId, load]);

  return { counts, reload: load };
}
