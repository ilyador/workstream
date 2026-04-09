import { useEffect, useCallback } from 'react';
import { getFlows, createFlow as apiCreate, updateFlow as apiUpdate, deleteFlow as apiDelete, updateFlowSteps as apiUpdateSteps, type Flow } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useFlows(projectId: string | null) {
  type FlowStepInput = Parameters<typeof apiUpdateSteps>[1][number];
  const {
    data: flows,
    setData: setFlows,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, async (id) => {
    const data = await getFlows(id);
    return data.sort((a, b) => a.position - b.position);
  }, {
    createInitialValue: () => [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load flows',
  });

  useEffect(() => {
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'flow_changed' && event.flow) {
        setFlows(prev => {
          const idx = prev.findIndex(f => f.id === event.flow.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...event.flow };
            return next.sort((a, b) => a.position - b.position);
          }
          return [...prev, event.flow].sort((a, b) => a.position - b.position);
        });
      } else if (event.type === 'flow_deleted' && event.flow_id) {
        setFlows(prev => prev.filter(f => f.id !== event.flow_id));
      } else if (event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [projectId, load, setFlows]);

  const createFlow = useCallback(async (data: { project_id: string; name: string; description?: string; steps?: FlowStepInput[] }): Promise<Flow> => {
    const created = await apiCreate(data);
    await load();
    return created;
  }, [load]);

  const updateFlow = useCallback(async (id: string, data: Record<string, unknown>) => {
    // Optimistic update so subsequent reads (e.g. rapid tag toggles) see fresh state
    setFlows(prev => prev.map(f => f.id === id ? { ...f, ...data } as Flow : f));
    await apiUpdate(id, data);
  }, [setFlows]);

  const deleteFlow = useCallback(async (id: string) => {
    await apiDelete(id);
    await load();
  }, [load]);

  const updateFlowSteps = useCallback(async (flowId: string, steps: FlowStepInput[]) => {
    await apiUpdateSteps(flowId, steps);
  }, []);

  /** Save flow metadata + steps in one go, then reload once. */
  const saveFlow = useCallback(async (id: string, data: Record<string, unknown>, steps: FlowStepInput[]) => {
    await apiUpdate(id, data);
    await apiUpdateSteps(id, steps);
    await load();
  }, [load]);

  return { flows, setFlows, loading, error, ready, reload: load, createFlow, updateFlow, deleteFlow, updateFlowSteps, saveFlow };
}
