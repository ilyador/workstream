import { useEffect } from 'react';
import { getWorkstreams, createWorkstream as apiCreate, updateWorkstream as apiUpdate, deleteWorkstream as apiDelete } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useWorkstreams(projectId: string | null) {
  const {
    data: workstreams,
    setData: setWorkstreams,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, getWorkstreams, {
    createInitialValue: () => [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load workstreams',
  });

  useEffect(() => {
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'workstream_changed' && event.workstream) {
        setWorkstreams(prev => {
          const idx = prev.findIndex(w => w.id === event.workstream.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...event.workstream };
            return next;
          }
          return [...prev, event.workstream].sort((a, b) => a.position - b.position);
        });
      } else if (event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [projectId, load, setWorkstreams]);

  async function createWs(name: string, description?: string, has_code?: boolean) {
    if (!projectId) return;
    await apiCreate(projectId, name, description, has_code);
    await load();
  }

  async function updateWs(id: string, data: Record<string, unknown>) {
    await apiUpdate(id, data);
    await load();
  }

  async function deleteWs(id: string) {
    await apiDelete(id);
    await load();
  }

  const active = workstreams.filter(w => w.status !== 'archived');

  return { workstreams, setWorkstreams, active, loading, error, ready, createWorkstream: createWs, updateWorkstream: updateWs, deleteWorkstream: deleteWs, reload: load };
}
