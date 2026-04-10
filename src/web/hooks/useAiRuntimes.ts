import { useEffect } from 'react';
import { AI_RUNTIME_DEFINITIONS, type AiRuntimeStatus } from '../../shared/ai-runtimes.js';
import { getAiRuntimes } from '../lib/api';
import { useProjectResource } from './useProjectResource';

const EMPTY_RUNTIMES: AiRuntimeStatus[] = AI_RUNTIME_DEFINITIONS.map(runtime => ({
  ...runtime,
  available: false,
  detectedPath: null,
}));

export function useAiRuntimes() {
  const {
    data,
    setData,
    loading,
    error,
    ready,
    reload,
  } = useProjectResource('__global__', async () => {
    const response = await getAiRuntimes();
    return response.runtimes;
  }, {
    createInitialValue: () => EMPTY_RUNTIMES,
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load AI runtimes',
  });

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    runtimes: data,
    setRuntimes: setData,
    loading,
    error,
    ready,
    reload,
  };
}
