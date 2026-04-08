import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectAdmin, requireProjectMember, routeParam } from '../authz.js';
import { assertEmbeddingProviderUsable, resolveFallbackEmbeddingProvider } from '../rag/embeddings.js';
import { reindexProjectDocuments } from '../rag/ingest.js';
import type { ProviderConfigRecord, ProviderStatus } from '../providers/types.js';
import { supabase } from '../supabase.js';
import {
  buildProviderInsert,
  detectDefaultLocalProviders,
  discoverProviderModels,
  getProjectProviderConfigs,
  getProviderConfigById,
  normalizeProviderInput,
  providerLabel,
  publicProviderRecord,
  testProviderConfig,
} from '../providers/registry.js';

export const providersRouter = Router();
const SINGLE_CONFIG_PROVIDERS = new Set(['claude', 'codex']);
const EMBEDDING_REINDEX_FIELDS = new Set(['base_url', 'api_key', 'supports_embeddings', 'embedding_model']);

interface EmbeddingDependencySnapshot {
  embedding_provider_config_id: string | null;
  embedding_dimensions: number | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function queryFlag(value: unknown): boolean {
  return value === '1' || value === 'true';
}

function hasEmbeddingReindexSensitiveUpdate(body: Record<string, unknown>): boolean {
  return [...EMBEDDING_REINDEX_FIELDS].some(field => field in body);
}

function proposedProviderRecord(config: ProviderConfigRecord, status: ProviderStatus) {
  return publicProviderRecord({
    ...config,
    api_key: config.api_key,
  }, status);
}

async function loadEmbeddingProjectSettings(projectId: string): Promise<EmbeddingDependencySnapshot> {
  const { data: projectSettings, error: settingsError } = await supabase
    .from('projects')
    .select('embedding_provider_config_id, embedding_dimensions')
    .eq('id', projectId)
    .single();
  if (settingsError) throw new Error(settingsError.message);
  return {
    embedding_provider_config_id: typeof projectSettings?.embedding_provider_config_id === 'string'
      ? projectSettings.embedding_provider_config_id
      : null,
    embedding_dimensions: typeof projectSettings?.embedding_dimensions === 'number'
      ? projectSettings.embedding_dimensions
      : null,
  };
}

function snapshotReferencesProviderConfig(snapshot: unknown, providerConfigId: string): boolean {
  const flowSnapshot = record(snapshot);
  const steps = Array.isArray(flowSnapshot.steps) ? flowSnapshot.steps : [];
  return steps.some(step => record(step).provider_config_id === providerConfigId);
}

providersRouter.get('/api/providers', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;
  const includeStatus = queryFlag(req.query.include_status);
  const includeDetected = queryFlag(req.query.include_detected);

  const [configs, projectSettings] = await Promise.all([
    getProjectProviderConfigs(projectId),
    supabase.from('projects').select('embedding_provider_config_id, embedding_dimensions').eq('id', projectId).single(),
  ]);
  const statuses = includeStatus ? await Promise.all(configs.map(config => testProviderConfig(config))) : [];
  const detected = includeDetected ? await detectDefaultLocalProviders(projectId) : [];

  res.json({
    providers: configs.map((config, index) => publicProviderRecord(config, statuses[index])),
    embedding_provider_config_id: projectSettings.data?.embedding_provider_config_id || null,
    embedding_dimensions: projectSettings.data?.embedding_dimensions ?? null,
    detected_local_providers: detected,
  });
});

providersRouter.post('/api/providers', requireAuth, async (req, res) => {
  const projectId = typeof req.body?.project_id === 'string' ? req.body.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id is required' });
  if (!await requireProjectAdmin(req, res, projectId)) return;

  const provider = normalizeProviderInput(req.body?.provider);
  if (SINGLE_CONFIG_PROVIDERS.has(provider)) {
    const { data: existing } = await supabase
      .from('provider_configs')
      .select('id')
      .eq('project_id', projectId)
      .eq('provider', provider)
      .maybeSingle();
    if (existing) return res.status(409).json({ error: `${providerLabel(provider)} already exists for this project` });
  }

  const insert = buildProviderInsert(projectId, provider, req.body || {});
  const { data, error } = await supabase
    .from('provider_configs')
    .insert(insert)
    .select('*')
    .single();
  if (error) return res.status(400).json({ error: error.message });

  const config = await getProviderConfigById(projectId, data.id);
  if (!config) return res.status(500).json({ error: 'Provider was created but could not be loaded' });
  const status = await testProviderConfig(config);
  res.json(publicProviderRecord(config, status));
});

providersRouter.patch('/api/providers/:id', requireAuth, async (req, res) => {
  const providerConfigId = routeParam(req.params.id);
  const projectId = typeof req.body?.project_id === 'string' ? req.body.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id is required' });
  if (!await requireProjectAdmin(req, res, projectId)) return;

  const current = await getProviderConfigById(projectId, providerConfigId);
  if (!current) return res.status(404).json({ error: 'Provider not found' });
  let projectSettings: EmbeddingDependencySnapshot;
  try {
    projectSettings = await loadEmbeddingProjectSettings(projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project settings';
    return res.status(400).json({ error: message });
  }

  const updates: Record<string, unknown> = {};
  if (typeof req.body?.label === 'string') updates.label = req.body.label.trim() || current.label;
  if (typeof req.body?.base_url === 'string') updates.base_url = req.body.base_url.trim().replace(/\/+$/, '') || null;
  if (typeof req.body?.is_enabled === 'boolean') updates.is_enabled = req.body.is_enabled;
  if (typeof req.body?.supports_embeddings === 'boolean') updates.supports_embeddings = req.body.supports_embeddings;
  if ('embedding_model' in (req.body || {})) updates.embedding_model = typeof req.body?.embedding_model === 'string' && req.body.embedding_model.trim() ? req.body.embedding_model.trim() : null;
  if ('api_key' in (req.body || {})) updates.api_key = typeof req.body?.api_key === 'string' && req.body.api_key.trim() ? req.body.api_key.trim() : null;
  const reindexDocuments = req.body?.reindex_documents === true;
  const isActiveEmbeddingProvider = projectSettings.embedding_provider_config_id === providerConfigId;
  const nextConfig: ProviderConfigRecord = {
    ...current,
    ...updates,
    label: typeof updates.label === 'string' ? updates.label : current.label,
    base_url: updates.base_url === undefined ? current.base_url : updates.base_url as string | null,
    api_key: updates.api_key === undefined ? current.api_key : updates.api_key as string | null,
    is_enabled: updates.is_enabled === undefined ? current.is_enabled : updates.is_enabled as boolean,
    supports_embeddings: updates.supports_embeddings === undefined ? current.supports_embeddings : updates.supports_embeddings as boolean,
    embedding_model: updates.embedding_model === undefined ? current.embedding_model : updates.embedding_model as string | null,
  };
  if (isActiveEmbeddingProvider) {
    try {
      assertEmbeddingProviderUsable(nextConfig, 'Selected embedding provider');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Selected embedding provider would become invalid';
      return res.status(400).json({ error: `${message}. Choose a different embedding provider first.` });
    }
  }

  if (isActiveEmbeddingProvider && hasEmbeddingReindexSensitiveUpdate(req.body || {})) {
    const status = await testProviderConfig(nextConfig);
    if (!status.ok) return res.status(400).json({ error: status.message });
    if (!status.embedding_dimensions) {
      return res.status(400).json({ error: `Could not determine embedding dimensions for ${nextConfig.label}` });
    }

    const requiresReindex = projectSettings.embedding_dimensions != null
      && projectSettings.embedding_dimensions !== status.embedding_dimensions;
    if (requiresReindex && !reindexDocuments) {
      return res.json({
        provider: proposedProviderRecord(nextConfig, status),
        embedding_provider_config_id: projectSettings.embedding_provider_config_id,
        requested_embedding_provider_config_id: providerConfigId,
        embedding_dimensions: projectSettings.embedding_dimensions,
        detected_embedding_dimensions: status.embedding_dimensions,
        requires_reindex: true,
        updated: false,
        reindexed: null,
      });
    }

    let reindexed: number | null = null;
    if (reindexDocuments) {
      const result = await reindexProjectDocuments(projectId, nextConfig);
      reindexed = result.reindexed;
    }

    const { error } = await supabase
      .from('provider_configs')
      .update(updates)
      .eq('id', providerConfigId)
      .eq('project_id', projectId);
    if (error) return res.status(400).json({ error: error.message });

    const config = await getProviderConfigById(projectId, providerConfigId);
    if (!config) return res.status(500).json({ error: 'Updated provider could not be loaded' });
    const refreshedStatus = reindexDocuments ? await testProviderConfig(config) : status;
    return res.json({
      provider: publicProviderRecord(config, refreshedStatus),
      embedding_provider_config_id: projectSettings.embedding_provider_config_id,
      requested_embedding_provider_config_id: providerConfigId,
      embedding_dimensions: reindexDocuments
        ? refreshedStatus.embedding_dimensions ?? projectSettings.embedding_dimensions
        : projectSettings.embedding_dimensions,
      detected_embedding_dimensions: refreshedStatus.embedding_dimensions ?? null,
      requires_reindex: requiresReindex,
      updated: true,
      reindexed,
    });
  }

  const { error } = await supabase
    .from('provider_configs')
    .update(updates)
    .eq('id', providerConfigId)
    .eq('project_id', projectId);
  if (error) return res.status(400).json({ error: error.message });

  const config = await getProviderConfigById(projectId, providerConfigId);
  if (!config) return res.status(500).json({ error: 'Updated provider could not be loaded' });
  const status = await testProviderConfig(config);
  res.json(publicProviderRecord(config, status));
});

providersRouter.delete('/api/providers/:id', requireAuth, async (req, res) => {
  const providerConfigId = routeParam(req.params.id);
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectAdmin(req, res, projectId)) return;

  const config = await getProviderConfigById(projectId, providerConfigId);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  if (config.provider === 'claude' || config.provider === 'codex') {
    return res.status(400).json({ error: 'Built-in CLI providers cannot be deleted. Disable them instead.' });
  }
  let projectSettings: EmbeddingDependencySnapshot;
  try {
    projectSettings = await loadEmbeddingProjectSettings(projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project settings';
    return res.status(400).json({ error: message });
  }
  if (projectSettings.embedding_provider_config_id === providerConfigId) {
    return res.status(400).json({ error: 'Select a different embedding provider before deleting this one.' });
  }
  const { data: flowStepReference, error: flowStepError } = await supabase
    .from('flow_steps')
    .select('id')
    .eq('provider_config_id', providerConfigId)
    .limit(1)
    .maybeSingle();
  if (flowStepError) return res.status(400).json({ error: flowStepError.message });
  if (flowStepReference) {
    return res.status(400).json({ error: 'This provider is still bound to one or more flow steps. Reassign those flow steps before deleting it.' });
  }
  const { data: taskReference, error: taskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('provider_config_id', providerConfigId)
    .limit(1)
    .maybeSingle();
  if (taskError) return res.status(400).json({ error: taskError.message });
  if (taskReference) {
    return res.status(400).json({ error: 'This provider is still selected by one or more tasks. Reassign those tasks before deleting it.' });
  }
  const { data: activeJobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, status, flow_snapshot')
    .eq('project_id', projectId);
  if (jobsError) return res.status(400).json({ error: jobsError.message });
  const blockingJob = (activeJobs || []).find(job => {
    if (typeof job?.status !== 'string' || job.status === 'done' || job.status === 'failed' || job.status === 'canceled') {
      return false;
    }
    return snapshotReferencesProviderConfig(job.flow_snapshot, providerConfigId);
  });
  if (blockingJob) {
    return res.status(400).json({ error: 'This provider is still referenced by queued or active jobs. Reset or finish those jobs before deleting it.' });
  }

  const { error } = await supabase.from('provider_configs').delete().eq('id', providerConfigId).eq('project_id', projectId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

providersRouter.post('/api/providers/:id/test', requireAuth, async (req, res) => {
  const providerConfigId = routeParam(req.params.id);
  const projectId = typeof req.body?.project_id === 'string' ? req.body.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id is required' });
  if (!await requireProjectMember(req, res, projectId)) return;

  const config = await getProviderConfigById(projectId, providerConfigId);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  const status = await testProviderConfig(config);
  res.json(status);
});

providersRouter.get('/api/providers/:id/models', requireAuth, async (req, res) => {
  const providerConfigId = routeParam(req.params.id);
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;

  const config = await getProviderConfigById(projectId, providerConfigId);
  if (!config) return res.status(404).json({ error: 'Provider not found' });
  try {
    const models = await discoverProviderModels(config);
    res.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to discover models';
    res.status(400).json({ error: message });
  }
});

providersRouter.patch('/api/projects/:id/embedding-provider', requireAuth, async (req, res) => {
  const projectId = routeParam(req.params.id);
  if (!await requireProjectAdmin(req, res, projectId)) return;

  const providerConfigId = typeof req.body?.embedding_provider_config_id === 'string' ? req.body.embedding_provider_config_id : null;
  const reindexDocuments = req.body?.reindex_documents === true;
  const nextProvider = providerConfigId ? await getProviderConfigById(projectId, providerConfigId) : null;
  if (providerConfigId && !nextProvider) return res.status(404).json({ error: 'Embedding provider not found' });
  if (nextProvider) {
    try {
      assertEmbeddingProviderUsable(nextProvider, 'Selected embedding provider');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Selected embedding provider is invalid';
      return res.status(400).json({ error: message });
    }
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('embedding_provider_config_id, embedding_dimensions')
    .eq('id', projectId)
    .single();
  if (projectError) return res.status(400).json({ error: projectError.message });

  try {
    const candidateProvider = nextProvider ?? await resolveFallbackEmbeddingProvider(projectId);
    const testResult = await testProviderConfig(candidateProvider);
    if (!testResult.ok) {
      return res.status(400).json({ error: testResult.message });
    }
    if (!testResult.embedding_dimensions) {
      return res.status(400).json({ error: `Could not determine embedding dimensions for ${candidateProvider.label}` });
    }

    const requiresReindex = !!project?.embedding_dimensions
      && project.embedding_dimensions !== testResult.embedding_dimensions;
    if (requiresReindex && !reindexDocuments) {
      return res.json({
        embedding_provider_config_id: project?.embedding_provider_config_id ?? null,
        requested_embedding_provider_config_id: providerConfigId,
        embedding_dimensions: project?.embedding_dimensions ?? null,
        detected_embedding_dimensions: testResult.embedding_dimensions,
        requires_reindex: true,
        updated: false,
        reindexed: null,
      });
    }

    let reindexed: number | null = null;
    if (reindexDocuments) {
      const result = await reindexProjectDocuments(projectId, candidateProvider);
      reindexed = result.reindexed;
    }

    const { error } = await supabase
      .from('projects')
      .update({ embedding_provider_config_id: providerConfigId })
      .eq('id', projectId);
    if (error) return res.status(400).json({ error: error.message });

    const { data: refreshedProject, error: refreshedError } = await supabase
      .from('projects')
      .select('embedding_dimensions')
      .eq('id', projectId)
      .single();
    if (refreshedError) return res.status(400).json({ error: refreshedError.message });

    res.json({
      embedding_provider_config_id: providerConfigId,
      embedding_dimensions: refreshedProject?.embedding_dimensions ?? null,
      detected_embedding_dimensions: testResult.embedding_dimensions,
      requires_reindex: requiresReindex,
      updated: true,
      reindexed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update embedding provider';
    res.status(400).json({ error: message });
  }
});

providersRouter.post('/api/projects/:id/reindex-documents', requireAuth, async (req, res) => {
  const projectId = routeParam(req.params.id);
  if (!await requireProjectAdmin(req, res, projectId)) return;

  try {
    const result = await reindexProjectDocuments(projectId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to re-index documents';
    res.status(400).json({ error: message });
  }
});
