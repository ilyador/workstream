import { useState, useEffect, useCallback } from 'react';
import { getWorkstreams, createWorkstream as apiCreate, updateWorkstream as apiUpdate, deleteWorkstream as apiDelete } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

interface Workstream {
  id: string;
  project_id: string;
  name: string;
  description: string;
  has_code: boolean;
  status: string;
  position: number;
  pr_url: string | null;
  reviewer_id: string | null;
  created_at: string;
}

export function useWorkstreams(projectId: string | null) {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const data = await getWorkstreams(projectId);
    setWorkstreams(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
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
        load();
      }
    });
    return unsub;
  }, [projectId, load]);

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

  return { workstreams, setWorkstreams, active, loading, createWorkstream: createWs, updateWorkstream: updateWs, deleteWorkstream: deleteWs, reload: load };
}
