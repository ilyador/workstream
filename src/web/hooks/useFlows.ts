import { useState, useEffect, useCallback } from 'react';
import { getFlows, createFlow as apiCreate, updateFlow as apiUpdate, deleteFlow as apiDelete, updateFlowSteps as apiUpdateSteps, type Flow } from '../lib/api';

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

  useEffect(() => { load(); }, [load]);

  const createFlow = useCallback(async (data: { project_id: string; name: string; description?: string; steps?: any[] }): Promise<Flow> => {
    const created = await apiCreate(data);
    await load();
    return created;
  }, [load]);

  const updateFlow = useCallback(async (id: string, data: Record<string, unknown>) => {
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
