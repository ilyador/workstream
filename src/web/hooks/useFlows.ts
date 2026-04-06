import { useState, useEffect, useCallback } from 'react';
import { getFlows, createFlow as apiCreate, updateFlow as apiUpdate, deleteFlow as apiDelete, updateFlowSteps as apiUpdateSteps, type Flow } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

export function useFlows(projectId: string | null) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const data = await getFlows(projectId);
      setFlows(data.sort((a, b) => a.position - b.position));
    } catch (err: any) {
      console.error('[useFlows] Failed to load flows:', err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'flow_changed' && event.flow) {
        setFlows(prev => {
          const idx = prev.findIndex(f => f.id === event.flow.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...event.flow };
            return next;
          }
          return [...prev, event.flow].sort((a, b) => a.position - b.position);
        });
      } else if (event.type === 'flow_deleted' && event.flow_id) {
        setFlows(prev => prev.filter(f => f.id !== event.flow_id));
      } else if (event.type === 'full_sync') {
        load();
      }
    });
    return unsub;
  }, [projectId, load]);

  const createFlow = useCallback(async (data: { project_id: string; name: string; description?: string; steps?: any[] }): Promise<Flow> => {
    const created = await apiCreate(data);
    await load();
    return created;
  }, [load]);

  const updateFlow = useCallback(async (id: string, data: Record<string, unknown>) => {
    // Optimistic update so subsequent reads (e.g. rapid tag toggles) see fresh state
    setFlows(prev => prev.map(f => f.id === id ? { ...f, ...data } as Flow : f));
    await apiUpdate(id, data);
  }, []);

  const deleteFlow = useCallback(async (id: string) => {
    await apiDelete(id);
    await load();
  }, [load]);

  const updateFlowSteps = useCallback(async (flowId: string, steps: any[]) => {
    await apiUpdateSteps(flowId, steps);
  }, []);

  /** Save flow metadata + steps in one go, then reload once. */
  const saveFlow = useCallback(async (id: string, data: Record<string, unknown>, steps: any[]) => {
    await apiUpdate(id, data);
    await apiUpdateSteps(id, steps);
    await load();
  }, [load]);

  return { flows, setFlows, loading, reload: load, createFlow, updateFlow, deleteFlow, updateFlowSteps, saveFlow };
}
