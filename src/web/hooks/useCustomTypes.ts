import { useEffect, useCallback } from 'react';
import { getCustomTypes, createCustomType, deleteCustomType } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';
import { useProjectResource } from './useProjectResource';

export function useCustomTypes(projectId: string | null) {
  const {
    data: types,
    setData: setTypes,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, getCustomTypes, {
    createInitialValue: () => [],
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load custom types',
  });

  useEffect(() => {
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'custom_type_changed' || event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [projectId, load]);

  const addType = useCallback(async (name: string, pipeline?: string, description?: string) => {
    if (!projectId) return;
    const created = await createCustomType(projectId, name, pipeline, description);
    setTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }, [projectId, setTypes]);

  const removeType = useCallback(async (id: string) => {
    await deleteCustomType(id);
    setTypes(prev => prev.filter(t => t.id !== id));
  }, [setTypes]);

  return { types, setTypes, loading, error, ready, reload: load, addType, removeType };
}
