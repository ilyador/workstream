import { useEffect } from 'react';
import { getProjectDataSettings, type ProjectDataSettings } from '../lib/api';
import { useProjectResource } from './useProjectResource';

const EMPTY_SETTINGS: ProjectDataSettings = {
  enabled: false,
  backend: 'lmstudio',
  baseUrl: 'http://localhost:1234/v1',
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5',
  topK: 5,
};

export function useProjectDataSettings(projectId: string | null) {
  const {
    data,
    setData,
    loading,
    error,
    ready,
    reload,
  } = useProjectResource(projectId, getProjectDataSettings, {
    createInitialValue: () => EMPTY_SETTINGS,
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load Project Data settings',
  });

  useEffect(() => {
    void reload();
  }, [projectId, reload]);

  return {
    settings: data,
    setSettings: setData,
    loading,
    error,
    ready,
    reload,
  };
}
