import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { ProviderConfigRecord } from '../providers/types.js';

const state = vi.hoisted(() => {
  const data = {
    projectRow: {
      embedding_provider_config_id: 'provider-current' as string | null,
      embedding_dimensions: 768 as number | null,
    },
    providerById: {} as Record<string, ProviderConfigRecord>,
    flowStepRefs: [] as Array<{ id: string; provider_config_id: string }>,
    taskRefs: [] as Array<{ id: string; provider_config_id: string }>,
    jobs: [] as Array<{ id: string; project_id: string; status: string; flow_snapshot: unknown }>,
    testResult: {
      ok: true,
      status: 'online' as const,
      message: 'ok',
      models: [] as string[],
      embedding_dimensions: 1536,
    },
    reindexCount: 0,
    reindexProjectDocumentsMock: vi.fn(async (_projectId: string, provider?: ProviderConfigRecord) => {
      data.reindexCount++;
      if (provider && data.providerById[provider.id]) {
        data.providerById[provider.id] = { ...provider };
      }
      data.projectRow.embedding_dimensions = data.testResult.embedding_dimensions ?? null;
      return { reindexed: 4 };
    }),
  };

  return data;
});

vi.mock('../auth-middleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../authz.js', () => ({
  requireProjectAdmin: vi.fn(async () => true),
  requireProjectMember: vi.fn(async () => true),
  routeParam: (value: string) => value,
}));

vi.mock('../rag/embeddings.js', () => ({
  assertEmbeddingProviderUsable: vi.fn(),
  resolveFallbackEmbeddingProvider: vi.fn(async () => state.providerById['provider-current']),
}));

vi.mock('../rag/ingest.js', () => ({
  reindexProjectDocuments: state.reindexProjectDocumentsMock,
}));

vi.mock('../providers/registry.js', () => ({
  buildProviderInsert: vi.fn(),
  detectDefaultLocalProviders: vi.fn(async () => []),
  discoverProviderModels: vi.fn(async () => []),
  getProjectProviderConfigs: vi.fn(async () => Object.values(state.providerById)),
  getProviderConfigById: vi.fn(async (_projectId: string, providerId: string) => state.providerById[providerId] ?? null),
  normalizeProviderInput: vi.fn((value: string) => value),
  providerLabel: vi.fn((value: string) => value),
  publicProviderRecord: vi.fn((config: ProviderConfigRecord, status?: { status: string; message: string; models: string[]; embedding_dimensions?: number | null }) => ({
    ...config,
    status: status?.status ?? 'offline',
    status_message: status?.message ?? 'Unavailable',
    models: status?.models ?? [],
    model_suggestions: [],
    has_api_key: false,
    embedding_dimensions: status?.embedding_dimensions ?? null,
  })),
  testProviderConfig: vi.fn(async () => state.testResult),
}));

function makeChain<T>(
  exec: (filters: Record<string, unknown>, limit: number | null, mode: 'many' | 'single' | 'maybeSingle') => Promise<T>,
) {
  const filters: Record<string, unknown> = {};
  let limit: number | null = null;
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    }),
    limit: vi.fn((value: number) => {
      limit = value;
      return chain;
    }),
    single: vi.fn(async () => exec(filters, limit, 'single')),
    maybeSingle: vi.fn(async () => exec(filters, limit, 'maybeSingle')),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) => (
      exec(filters, limit, 'many').then(resolve, reject)
    ),
  };
  return chain;
}

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        const selectChain = makeChain(async () => ({ data: state.projectRow, error: null }));
        return {
          ...selectChain,
          update: vi.fn((payload: Record<string, unknown>) => makeChain(async () => {
            state.projectRow = { ...state.projectRow, ...payload };
            return { error: null };
          })),
        };
      }

      if (table === 'provider_configs') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => makeChain(async (filters) => {
            const providerId = filters.id;
            if (typeof providerId === 'string' && state.providerById[providerId]) {
              state.providerById[providerId] = {
                ...state.providerById[providerId],
                ...payload,
              };
            }
            return { error: null };
          })),
          delete: vi.fn(() => makeChain(async (filters) => {
            const providerId = filters.id;
            if (typeof providerId === 'string') {
              delete state.providerById[providerId];
            }
            return { error: null };
          })),
          select: vi.fn(() => makeChain(async (filters, _limit, mode) => {
            const matches = Object.values(state.providerById).filter(provider => {
              return Object.entries(filters).every(([field, value]) => provider[field as keyof ProviderConfigRecord] === value);
            });
            if (mode === 'single' || mode === 'maybeSingle') {
              return { data: matches[0] ?? null, error: null };
            }
            return { data: matches, error: null };
          })),
        };
      }

      if (table === 'flow_steps') {
        return {
          select: vi.fn(() => makeChain(async (filters, _limit, mode) => {
            const match = state.flowStepRefs.find(step => step.provider_config_id === filters.provider_config_id) ?? null;
            if (mode === 'single' || mode === 'maybeSingle') {
              return { data: match, error: null };
            }
            return { data: match ? [match] : [], error: null };
          })),
        };
      }

      if (table === 'tasks') {
        return {
          select: vi.fn(() => makeChain(async (filters, _limit, mode) => {
            const match = state.taskRefs.find(task => task.provider_config_id === filters.provider_config_id) ?? null;
            if (mode === 'single' || mode === 'maybeSingle') {
              return { data: match, error: null };
            }
            return { data: match ? [match] : [], error: null };
          })),
        };
      }

      if (table === 'jobs') {
        return {
          select: vi.fn(() => makeChain(async (filters) => ({
            data: state.jobs.filter(job => Object.entries(filters).every(([field, value]) => job[field as keyof typeof job] === value)),
            error: null,
          }))),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

import { providersRouter } from './providers.js';
import { detectDefaultLocalProviders, testProviderConfig } from '../providers/registry.js';

function makeProvider(id: string, overrides: Partial<ProviderConfigRecord> = {}): ProviderConfigRecord {
  return {
    id,
    project_id: 'project-1',
    provider: 'custom',
    label: id,
    base_url: 'http://localhost:1234',
    api_key: null,
    is_enabled: true,
    supports_embeddings: true,
    embedding_model: 'text-embedding-test',
    ...overrides,
  };
}

describe('providersRouter provider safety', () => {
  let server: ReturnType<express.Application['listen']> | null = null;

  beforeEach(() => {
    state.projectRow = {
      embedding_provider_config_id: 'provider-current',
      embedding_dimensions: 768,
    };
    state.providerById = {
      'provider-current': makeProvider('provider-current'),
      'provider-next': makeProvider('provider-next'),
    };
    state.flowStepRefs = [];
    state.taskRefs = [];
    state.jobs = [];
    state.testResult = {
      ok: true,
      status: 'online',
      message: 'ok',
      models: [],
      embedding_dimensions: 1536,
    };
    state.reindexCount = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close(error => error ? reject(error) : resolve());
      });
      server = null;
    }
  });

  async function request(path: string, options: RequestInit = {}) {
    const app = express();
    app.use(express.json());
    app.use(providersRouter);
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) as Record<string, unknown> : null,
    };
  }

  it('loads provider configs without running diagnostics by default', async () => {
    const response = await request('/api/providers?project_id=project-1');

    expect(response.status).toBe(200);
    expect(vi.mocked(testProviderConfig)).not.toHaveBeenCalled();
    expect(vi.mocked(detectDefaultLocalProviders)).not.toHaveBeenCalled();
    expect(response.body?.providers).toHaveLength(2);
    expect(response.body?.detected_local_providers).toEqual([]);
  });

  it('loads provider diagnostics only when explicitly requested', async () => {
    vi.mocked(detectDefaultLocalProviders).mockResolvedValueOnce([
      { provider: 'ollama', label: 'Ollama', base_url: 'http://localhost:11434' },
    ]);

    const response = await request('/api/providers?project_id=project-1&include_status=1&include_detected=1');

    expect(response.status).toBe(200);
    expect(vi.mocked(testProviderConfig)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(detectDefaultLocalProviders)).toHaveBeenCalledWith('project-1');
    expect(response.body?.detected_local_providers).toEqual([
      { provider: 'ollama', label: 'Ollama', base_url: 'http://localhost:11434' },
    ]);
  });

  it('does not persist a mismatched embedding-provider switch until reindex is confirmed', async () => {
    const response = await request('/api/projects/project-1/embedding-provider', {
      method: 'PATCH',
      body: JSON.stringify({
        embedding_provider_config_id: 'provider-next',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body?.updated).toBe(false);
    expect(response.body?.requires_reindex).toBe(true);
    expect(state.projectRow.embedding_provider_config_id).toBe('provider-current');
    expect(state.reindexProjectDocumentsMock).not.toHaveBeenCalled();
  });

  it('reindexes first and only then persists the new embedding-provider selection', async () => {
    const response = await request('/api/projects/project-1/embedding-provider', {
      method: 'PATCH',
      body: JSON.stringify({
        embedding_provider_config_id: 'provider-next',
        reindex_documents: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body?.updated).toBe(true);
    expect(response.body?.reindexed).toBe(4);
    expect(state.projectRow.embedding_provider_config_id).toBe('provider-next');
    expect(state.reindexProjectDocumentsMock).toHaveBeenCalledWith('project-1', state.providerById['provider-next']);
  });

  it('does not persist an active embedding-provider edit until reindex is confirmed', async () => {
    const response = await request('/api/providers/provider-current', {
      method: 'PATCH',
      body: JSON.stringify({
        project_id: 'project-1',
        embedding_model: 'text-embedding-next',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body?.updated).toBe(false);
    expect(response.body?.requires_reindex).toBe(true);
    expect(state.providerById['provider-current'].embedding_model).toBe('text-embedding-test');
    expect(state.reindexProjectDocumentsMock).not.toHaveBeenCalled();
  });

  it('reindexes before persisting an active embedding-provider edit', async () => {
    const response = await request('/api/providers/provider-current', {
      method: 'PATCH',
      body: JSON.stringify({
        project_id: 'project-1',
        embedding_model: 'text-embedding-next',
        reindex_documents: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body?.updated).toBe(true);
    expect(response.body?.reindexed).toBe(4);
    expect(state.providerById['provider-current'].embedding_model).toBe('text-embedding-next');
    expect(state.reindexProjectDocumentsMock).toHaveBeenCalledWith('project-1', expect.objectContaining({
      id: 'provider-current',
      embedding_model: 'text-embedding-next',
    }));
  });

  it('blocks deleting a provider that is still bound to a flow step', async () => {
    state.flowStepRefs = [{ id: 'step-1', provider_config_id: 'provider-next' }];

    const response = await request('/api/providers/provider-next?project_id=project-1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(400);
    expect(response.body?.error).toContain('flow steps');
    expect(state.providerById['provider-next']).toBeDefined();
  });
});
