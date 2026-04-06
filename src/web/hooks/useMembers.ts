import { useEffect } from 'react';
import { getMembers, type MemberRecord } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useMembers(projectId: string | null) {
  const {
    data: members,
    setData: setMembers,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource<MemberRecord[]>(projectId, getMembers, {
    createInitialValue: () => [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load members',
  });

  useEffect(() => {
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'member_changed' || event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [projectId, load]);

  return { members, setMembers, loading, error, ready, reload: load };
}
