import { useState, useEffect, useCallback } from 'react';
import { getFlows, type Flow } from '../lib/api';

export function useFlows(projectId: string | null) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const data = await getFlows(projectId);
      setFlows(data);
    } catch {
      // Silently handle — flows list is optional during transition
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return { flows, loading, reload: load };
}
