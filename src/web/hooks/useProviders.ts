import type React from 'react';
import { useEffect, useCallback, useRef } from 'react';
import {
  type EmbeddingProviderUpdateResponse,
  createProvider as apiCreateProvider,
  deleteProvider as apiDeleteProvider,
  getProviders,
  getProviderModels,
  isProviderUpdateEmbeddingResponse,
  testProvider as apiTestProvider,
  updateEmbeddingProvider as apiUpdateEmbeddingProvider,
  updateProvider as apiUpdateProvider,
  reindexProjectDocuments as apiReindexProjectDocuments,
  type ProviderConfig,
  type ProviderListResponse,
  type ProviderUpdateResponse,
} from '../lib/api';
import { useProjectResource } from './useProjectResource';

export function useProviders(projectId: string | null) {
  const includeDiagnosticsRef = useRef(false);
  const {
    data,
    setData,
    loading,
    error,
    ready,
    reload: load,
  } = useProjectResource(projectId, async (id) => getProviders(id, {
    includeStatus: includeDiagnosticsRef.current,
    includeDetected: includeDiagnosticsRef.current,
  }), {
    createInitialValue: (): ProviderListResponse => ({
      providers: [],
      embedding_provider_config_id: null,
      embedding_dimensions: null,
      detected_local_providers: [],
    }),
    getErrorMessage: err => err instanceof Error ? err.message : 'Failed to load providers',
  });

  useEffect(() => {
    includeDiagnosticsRef.current = false;
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, projectId]);

  const loadDiagnostics = useCallback(async () => {
    if (!projectId) throw new Error('projectId is required');
    includeDiagnosticsRef.current = true;
    return load();
  }, [load, projectId]);

  const createProvider = useCallback(async (input: {
    provider: ProviderConfig['provider'];
    label?: string;
    base_url?: string;
    api_key?: string;
    is_enabled?: boolean;
    supports_embeddings?: boolean;
    embedding_model?: string;
  }) => {
    if (!projectId) throw new Error('projectId is required');
    await apiCreateProvider(projectId, input);
    await load();
  }, [load, projectId]);

  const updateProvider = useCallback(async (
    providerId: string,
    updates: Record<string, unknown>,
    opts: { reindexDocuments?: boolean } = {},
  ): Promise<ProviderUpdateResponse> => {
    if (!projectId) throw new Error('projectId is required');
    const result = await apiUpdateProvider(projectId, providerId, updates, opts);
    if (!isProviderUpdateEmbeddingResponse(result) || result.updated) {
      await load();
    }
    return result;
  }, [load, projectId]);

  const deleteProvider = useCallback(async (providerId: string) => {
    if (!projectId) throw new Error('projectId is required');
    await apiDeleteProvider(projectId, providerId);
    await load();
  }, [load, projectId]);

  const testProvider = useCallback(async (providerId: string) => {
    if (!projectId) throw new Error('projectId is required');
    return apiTestProvider(projectId, providerId);
  }, [projectId]);

  const refreshProviderModels = useCallback(async (providerId: string) => {
    if (!projectId) throw new Error('projectId is required');
    const result = await getProviderModels(projectId, providerId);
    setData(current => ({
      ...current,
      providers: current.providers.map(provider => (
        provider.id === providerId ? { ...provider, models: result.models } : provider
      )),
    }));
    return result.models;
  }, [projectId, setData]);

  const updateEmbeddingProvider = useCallback(async (
    embeddingProviderConfigId: string | null,
    opts: { reindexDocuments?: boolean } = {},
  ): Promise<EmbeddingProviderUpdateResponse> => {
    if (!projectId) throw new Error('projectId is required');
    const result = await apiUpdateEmbeddingProvider(projectId, embeddingProviderConfigId, opts);
    await load();
    return result;
  }, [load, projectId]);

  const reindexDocuments = useCallback(async () => {
    if (!projectId) throw new Error('projectId is required');
    const result = await apiReindexProjectDocuments(projectId);
    await load();
    return result;
  }, [load, projectId]);

  return {
    providers: data.providers,
    embeddingProviderConfigId: data.embedding_provider_config_id,
    embeddingDimensions: data.embedding_dimensions,
    detectedLocalProviders: data.detected_local_providers,
    setProviders: (updater: React.SetStateAction<ProviderConfig[]>) => {
      setData(current => ({
        ...current,
        providers: typeof updater === 'function' ? updater(current.providers) : updater,
      }));
    },
    loading,
    error,
    ready,
    reload: load,
    loadDiagnostics,
    createProvider,
    updateProvider,
    deleteProvider,
    testProvider,
    refreshProviderModels,
    updateEmbeddingProvider,
    reindexDocuments,
  };
}
