import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfigRecord } from './providers/types.js';

const state = vi.hoisted(() => ({
  configs: [] as ProviderConfigRecord[],
}));

vi.mock('./providers/registry.js', () => ({
  getProjectProviderConfigs: vi.fn(async () => state.configs),
}));

vi.mock('./supabase.js', () => ({
  supabase: {},
}));

import { resolveFlowStepProviderConfigs } from './flow-steps.js';

function makeConfig(id: string, provider: ProviderConfigRecord['provider']): ProviderConfigRecord {
  return {
    id,
    project_id: 'project-1',
    provider,
    label: `${provider}-${id}`,
    base_url: null,
    api_key: null,
    is_enabled: true,
    supports_embeddings: false,
    embedding_model: null,
  };
}

describe('resolveFlowStepProviderConfigs', () => {
  beforeEach(() => {
    state.configs = [];
  });

  it('clears provider_config_id for task-selected flows', async () => {
    state.configs = [makeConfig('provider-1', 'claude')];

    const resolved = await resolveFlowStepProviderConfigs('project-1', 'task_selected', [{
      name: 'Plan',
      position: 1,
      instructions: '',
      model: 'task:selected',
      provider_config_id: 'provider-1',
      tools: [],
      context_sources: [],
      is_gate: false,
      on_fail_jump_to: null,
      max_retries: 0,
      on_max_retries: 'pause',
    }]);

    expect(resolved[0].provider_config_id).toBeNull();
  });

  it('keeps an explicit provider config for flow-locked steps', async () => {
    state.configs = [makeConfig('provider-1', 'custom'), makeConfig('provider-2', 'custom')];

    const resolved = await resolveFlowStepProviderConfigs('project-1', 'flow_locked', [{
      name: 'Implement',
      position: 1,
      instructions: '',
      model: 'custom:gpt-4.1',
      provider_config_id: 'provider-2',
      tools: [],
      context_sources: [],
      is_gate: false,
      on_fail_jump_to: null,
      max_retries: 0,
      on_max_retries: 'pause',
    }]);

    expect(resolved[0].provider_config_id).toBe('provider-2');
  });

  it('rejects flow-locked steps that rely on an ambiguous provider-kind fallback', async () => {
    state.configs = [makeConfig('provider-1', 'custom'), makeConfig('provider-2', 'custom')];

    await expect(resolveFlowStepProviderConfigs('project-1', 'flow_locked', [{
      name: 'Implement',
      position: 1,
      instructions: '',
      model: 'custom:gpt-4.1',
      provider_config_id: null,
      tools: [],
      context_sources: [],
      is_gate: false,
      on_fail_jump_to: null,
      max_retries: 0,
      on_max_retries: 'pause',
    }])).rejects.toThrow(/multiple configs match/i);
  });
});
