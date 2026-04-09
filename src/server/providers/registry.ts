import { execFile } from 'child_process';
import { promisify } from 'util';
import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { supabase } from '../supabase.js';
import { aiSdkDriver } from './ai-sdk.js';
import { claudeCliDriver } from './claude-cli.js';
import { codexCliDriver } from './codex-cli.js';
import { defaultModelForProvider, isCliProvider, normalizeProviderKind, parseModelId, type ProviderKind } from './model-id.js';
import type { ProviderConfigRecord, ProviderDriver, ProviderStatus } from './types.js';
import {
  defaultProviderTaskConfig,
  normalizeProviderTaskConfig,
} from '../../shared/provider-task-config.js';

const execFileAsync = promisify(execFile);

const BUILT_IN_PROVIDER_DEFAULTS: Record<'claude' | 'codex', Pick<ProviderConfigRecord, 'label' | 'supports_embeddings' | 'embedding_model' | 'task_config'>> = {
  claude: {
    label: 'Claude CLI',
    supports_embeddings: false,
    embedding_model: null,
    task_config: defaultProviderTaskConfig('claude'),
  },
  codex: {
    label: 'Codex CLI',
    supports_embeddings: false,
    embedding_model: null,
    task_config: defaultProviderTaskConfig('codex'),
  },
};

const STATIC_MODEL_SUGGESTIONS: Record<ProviderKind, string[]> = {
  claude: ['opus', 'sonnet'],
  codex: ['gpt-5.4', 'gpt-5.4-mini', 'o3'],
  lmstudio: [],
  ollama: [],
  custom: [],
};

function recordFromValue(value: unknown): ProviderConfigRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const provider = normalizeProviderKind(typeof record.provider === 'string' ? record.provider : 'custom');
  const id = typeof record.id === 'string' ? record.id : '';
  const projectId = typeof record.project_id === 'string' ? record.project_id : '';
  if (!id || !projectId) return null;
  return {
    id,
    project_id: projectId,
    provider,
    label: typeof record.label === 'string' ? record.label : provider,
    base_url: typeof record.base_url === 'string' ? record.base_url : null,
    api_key: typeof record.api_key === 'string' ? record.api_key : null,
    is_enabled: record.is_enabled !== false,
    supports_embeddings: record.supports_embeddings === true,
    embedding_model: typeof record.embedding_model === 'string' ? record.embedding_model : null,
    task_config: normalizeProviderTaskConfig(provider, record.task_config),
    created_at: typeof record.created_at === 'string' ? record.created_at : undefined,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : undefined,
  };
}

function providerValue(row: unknown): string | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  return typeof record.provider === 'string' ? record.provider : null;
}

export async function ensureDefaultProviderConfigs(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from('provider_configs')
    .select('provider')
    .eq('project_id', projectId);
  if (error) throw new Error(`Failed to load provider configs: ${error.message}`);

  const existing = new Set((data || []).map(providerValue).filter((value): value is string => !!value));
  const inserts = Object.entries(BUILT_IN_PROVIDER_DEFAULTS)
    .filter(([provider]) => !existing.has(provider))
    .map(([provider, defaults]) => ({
      project_id: projectId,
      provider,
      label: defaults.label,
      is_enabled: true,
      supports_embeddings: defaults.supports_embeddings,
      embedding_model: defaults.embedding_model,
      task_config: defaults.task_config,
    }));
  if (inserts.length === 0) return;

  const { error: insertError } = await supabase.from('provider_configs').insert(inserts);
  if (insertError) throw new Error(`Failed to seed default providers: ${insertError.message}`);
}

export async function getProjectProviderConfigs(projectId: string): Promise<ProviderConfigRecord[]> {
  await ensureDefaultProviderConfigs(projectId);
  const { data, error } = await supabase
    .from('provider_configs')
    .select('*')
    .eq('project_id', projectId)
    .order('provider', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load provider configs: ${error.message}`);
  return (data || []).map(recordFromValue).filter((row): row is ProviderConfigRecord => !!row);
}

export async function getProviderConfigById(projectId: string, providerConfigId: string): Promise<ProviderConfigRecord | null> {
  await ensureDefaultProviderConfigs(projectId);
  const { data, error } = await supabase
    .from('provider_configs')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', providerConfigId)
    .single();
  if (error) return null;
  return recordFromValue(data);
}

export async function getProviderConfigByKind(projectId: string, provider: ProviderKind): Promise<ProviderConfigRecord | null> {
  const configs = await getProjectProviderConfigs(projectId);
  return configs.find(config => config.provider === provider) || null;
}

export async function resolveProviderConfig(
  projectId: string,
  modelId: string,
  providerConfigId: string | null = null,
): Promise<{ parsed: ReturnType<typeof parseModelId>; config: ProviderConfigRecord }> {
  const parsed = parseModelId(modelId);
  let config: ProviderConfigRecord | null;
  if (providerConfigId) {
    config = await getProviderConfigById(projectId, providerConfigId);
  } else {
    const matches = (await getProjectProviderConfigs(projectId))
      .filter(candidate => candidate.provider === parsed.provider);
    if (matches.length > 1) {
      throw new Error(`Multiple '${parsed.provider}' providers are configured for this project. Select a specific provider config instead of relying on a provider-kind fallback.`);
    }
    config = matches[0] || null;
  }
  if (!config) {
    if (providerConfigId) {
      throw new Error('The provider selected for this job no longer exists');
    }
    throw new Error(`Provider '${parsed.provider}' is not configured for this project`);
  }
  if (config.provider !== parsed.provider) {
    throw new Error(`Provider config '${config.label}' does not match model '${parsed.raw}'`);
  }
  if (!config.is_enabled) {
    throw new Error(`Provider '${config.label}' is disabled`);
  }
  return { parsed, config };
}

export function getProviderDriver(provider: ProviderKind): ProviderDriver {
  if (provider === 'claude') return claudeCliDriver;
  if (provider === 'codex') return codexCliDriver;
  return aiSdkDriver;
}

function providerModelsEndpoint(baseUrl: string | null): string {
  if (!baseUrl) throw new Error('Provider base URL is missing');
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/v1/models')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/models`;
  return `${normalized}/v1/models`;
}

async function discoverHttpModels(config: ProviderConfigRecord): Promise<string[]> {
  const response = await fetch(providerModelsEndpoint(config.base_url), {
    headers: config.api_key ? { Authorization: `Bearer ${config.api_key}` } : undefined,
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed (${response.status})`);
  }
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return [...new Set((payload.data || []).map(item => item.id).filter((item): item is string => typeof item === 'string' && item.length > 0))].sort();
}

async function detectEmbeddingDimensions(config: ProviderConfigRecord): Promise<{
  dimensions: number | null;
  error: Error | null;
}> {
  if (!config.supports_embeddings || !config.embedding_model || !config.base_url) {
    return { dimensions: null, error: null };
  }
  try {
    const client = createOpenAI({
      baseURL: config.base_url.endsWith('/v1') ? config.base_url : `${config.base_url.replace(/\/+$/, '')}/v1`,
      apiKey: config.api_key || 'local-provider',
      name: `${config.provider}-embedding`,
    });
    const result = await embed({
      model: client.embedding(config.embedding_model),
      value: 'healthcheck',
      abortSignal: AbortSignal.timeout(10000),
    });
    return {
      dimensions: Array.isArray(result.embedding) ? result.embedding.length : null,
      error: null,
    };
  } catch (error) {
    return {
      dimensions: null,
      error: error instanceof Error ? error : new Error('Embedding probe failed'),
    };
  }
}

export async function discoverProviderModels(config: ProviderConfigRecord): Promise<string[]> {
  if (config.provider === 'claude' || config.provider === 'codex') {
    return STATIC_MODEL_SUGGESTIONS[config.provider];
  }
  return discoverHttpModels(config);
}

export async function testProviderConfig(config: ProviderConfigRecord): Promise<ProviderStatus> {
  try {
    if (isCliProvider(config.provider)) {
      await execFileAsync('which', [config.provider === 'claude' ? 'claude' : 'codex'], {
        timeout: 3000,
      });
      return {
        ok: true,
        status: 'online',
        message: `${config.label} is available`,
        models: STATIC_MODEL_SUGGESTIONS[config.provider],
      };
    }

    const models = await discoverHttpModels(config);
    const embeddingProbe = await detectEmbeddingDimensions(config);
    if (embeddingProbe?.error) {
      throw embeddingProbe.error;
    }
    return {
      ok: true,
      status: 'online',
      message: `${config.label} responded successfully`,
      models,
      embedding_dimensions: embeddingProbe?.dimensions ?? null,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: 'offline',
      message: error instanceof Error ? error.message : 'Provider is offline',
      models: [],
      embedding_dimensions: null,
    };
  }
}

export async function detectDefaultLocalProviders(projectId: string): Promise<Array<{ provider: ProviderKind; label: string; base_url: string }>> {
  const configs = await getProjectProviderConfigs(projectId);
  const configured = new Set(configs.map(config => config.provider));
  const candidates: Array<{ provider: ProviderKind; label: string; base_url: string }> = [
    { provider: 'lmstudio', label: 'LM Studio', base_url: 'http://localhost:1234' },
    { provider: 'ollama', label: 'Ollama', base_url: 'http://localhost:11434' },
  ];

  const results = await Promise.all(candidates.map(async candidate => {
    if (configured.has(candidate.provider)) return null;
    const probe: ProviderConfigRecord = {
      id: candidate.provider,
      project_id: projectId,
      provider: candidate.provider,
      label: candidate.label,
      base_url: candidate.base_url,
      api_key: null,
      is_enabled: true,
      supports_embeddings: false,
      embedding_model: null,
      task_config: defaultProviderTaskConfig(candidate.provider),
    };
    const status = await testProviderConfig(probe);
    return status.ok ? candidate : null;
  }));

  return results.filter((candidate): candidate is { provider: ProviderKind; label: string; base_url: string } => !!candidate);
}

export function publicProviderRecord(config: ProviderConfigRecord, status?: ProviderStatus) {
  return {
    id: config.id,
    project_id: config.project_id,
    provider: config.provider,
    label: config.label,
    base_url: config.base_url,
    is_enabled: config.is_enabled,
    supports_embeddings: config.supports_embeddings,
    embedding_model: config.embedding_model,
    task_config: config.task_config,
    model_suggestions: STATIC_MODEL_SUGGESTIONS[config.provider] || [],
    status: status?.status || 'offline',
    status_message: status?.message || 'Unavailable',
    models: status?.models || STATIC_MODEL_SUGGESTIONS[config.provider] || [],
    has_api_key: !!config.api_key,
    embedding_dimensions: status?.embedding_dimensions ?? null,
  };
}

export function buildProviderInsert(projectId: string, provider: ProviderKind, body: Record<string, unknown>) {
  const taskConfig = Object.prototype.hasOwnProperty.call(body, 'task_config')
    ? normalizeProviderTaskConfig(provider, body.task_config)
    : defaultProviderTaskConfig(provider);
  return {
    project_id: projectId,
    provider,
    label: typeof body.label === 'string' && body.label.trim() ? body.label.trim() : providerLabel(provider),
    base_url: typeof body.base_url === 'string' && body.base_url.trim() ? body.base_url.trim().replace(/\/+$/, '') : null,
    api_key: typeof body.api_key === 'string' && body.api_key.trim() ? body.api_key.trim() : null,
    is_enabled: body.is_enabled !== false,
    supports_embeddings: body.supports_embeddings === true,
    embedding_model: typeof body.embedding_model === 'string' && body.embedding_model.trim() ? body.embedding_model.trim() : null,
    task_config: taskConfig,
  };
}

export function providerLabel(provider: ProviderKind): string {
  switch (provider) {
    case 'claude':
      return 'Claude CLI';
    case 'codex':
      return 'Codex CLI';
    case 'lmstudio':
      return 'LM Studio';
    case 'ollama':
      return 'Ollama';
    default:
      return 'Custom OpenAI-Compatible';
  }
}

export function suggestedModelList(provider: ProviderKind): string[] {
  return STATIC_MODEL_SUGGESTIONS[provider] || [];
}

export function normalizeProviderInput(value: unknown): ProviderKind {
  return normalizeProviderKind(typeof value === 'string' ? value.trim().toLowerCase() : '');
}

export function fallbackModelForProvider(provider: ProviderKind): string {
  return defaultModelForProvider(provider);
}
