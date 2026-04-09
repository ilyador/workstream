import { asRecord, stringField } from './authz.js';
import { DEFAULT_FLOWS, type FlowStepRow } from './default-flows.js';
import { type FlowProviderBinding, normalizeFlowProviderBinding } from '../shared/flow-provider-binding.js';
import { parseModelId, type ProviderKind } from './providers/model-id.js';
import { getProjectProviderConfigs } from './providers/registry.js';
import type { ProviderConfigRecord } from './providers/types.js';
import { supabase } from './supabase.js';

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
}

export function normalizeFlowStep(
  step: unknown,
  index: number,
  providerBinding: FlowProviderBinding | string | null | undefined = null,
): FlowStepRow {
  const record = asRecord(step) || {};
  const normalizedBinding = normalizeFlowProviderBinding(providerBinding);
  const fallbackModel = normalizedBinding === 'task_selected' ? 'task:selected' : '';
  const rawModel = typeof record.model === 'string' ? record.model.trim() : '';
  return {
    name: typeof record.name === 'string' ? record.name.trim() : '',
    position: typeof record.position === 'number' ? record.position : index + 1,
    instructions: typeof record.instructions === 'string' ? record.instructions : '',
    model: rawModel || fallbackModel,
    provider_config_id: typeof record.provider_config_id === 'string' ? record.provider_config_id : null,
    tools: stringArray(record.tools),
    context_sources: stringArray(record.context_sources, ['task_description', 'previous_step']),
    is_gate: record.is_gate === true,
    on_fail_jump_to: typeof record.on_fail_jump_to === 'number' ? record.on_fail_jump_to : null,
    max_retries: typeof record.max_retries === 'number' ? record.max_retries : 0,
    on_max_retries: typeof record.on_max_retries === 'string' ? record.on_max_retries : 'pause',
  };
}

function stepLabel(step: FlowStepRow, index: number): string {
  return step.name || `Step ${index + 1}`;
}

function configsByProvider(configs: ProviderConfigRecord[]): Map<ProviderKind, ProviderConfigRecord[]> {
  const grouped = new Map<ProviderKind, ProviderConfigRecord[]>();
  for (const config of configs) {
    const current = grouped.get(config.provider) || [];
    current.push(config);
    grouped.set(config.provider, current);
  }
  return grouped;
}

export async function resolveFlowStepProviderConfigs(
  projectId: string,
  providerBinding: FlowProviderBinding | string | null | undefined,
  steps: readonly FlowStepRow[],
): Promise<FlowStepRow[]> {
  if (normalizeFlowProviderBinding(providerBinding) !== 'flow_locked') {
    return steps.map(step => ({ ...step, provider_config_id: null }));
  }

  const configs = await getProjectProviderConfigs(projectId);
  const byId = new Map(configs.map(config => [config.id, config]));
  const enabledConfigs = configs.filter(config => config.is_enabled);
  const byProvider = configsByProvider(enabledConfigs);

  return steps.map((step, index) => {
    if (!(step.model || '').trim()) {
      throw new Error(`${stepLabel(step, index)} is missing a concrete provider model`);
    }
    const parsed = parseModelId(typeof step.model === 'string' ? step.model : '');
    const explicitConfigId = typeof step.provider_config_id === 'string' && step.provider_config_id.length > 0
      ? step.provider_config_id
      : null;

    if (explicitConfigId) {
      const explicitConfig = byId.get(explicitConfigId);
      if (!explicitConfig) {
        throw new Error(`${stepLabel(step, index)} references a provider config that no longer exists`);
      }
      if (!explicitConfig.is_enabled) {
        throw new Error(`${stepLabel(step, index)} references provider '${explicitConfig.label}', but that provider is disabled`);
      }
      if (explicitConfig.provider !== parsed.provider) {
        throw new Error(`${stepLabel(step, index)} uses model '${parsed.raw}' but is linked to provider '${explicitConfig.label}'`);
      }
      return {
        ...step,
        provider_config_id: explicitConfig.id,
      };
    }

    const matches = byProvider.get(parsed.provider) || [];
    if (matches.length === 0) {
      throw new Error(`${stepLabel(step, index)} uses provider '${parsed.provider}', but that provider is not configured for this project`);
    }
    if (matches.length > 1) {
      throw new Error(`${stepLabel(step, index)} uses provider '${parsed.provider}', but multiple configs match. Select a specific provider config for this step.`);
    }
    return {
      ...step,
      provider_config_id: matches[0].id,
    };
  });
}

export function numericPosition(value: unknown): number {
  const record = asRecord(value);
  return typeof record?.position === 'number' ? record.position : 0;
}

export function withSortedFlowSteps(flow: unknown): Record<string, unknown> {
  const record = asRecord(flow) || {};
  const steps = Array.isArray(record.flow_steps) ? [...record.flow_steps] : [];
  return {
    ...record,
    flow_steps: steps.sort((a, b) => numericPosition(a) - numericPosition(b)),
  };
}

export async function createDefaultFlows(projectId: string): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('flows')
    .select('name')
    .eq('project_id', projectId)
    .eq('is_builtin', true);
  if (existingError) throw new Error(`Failed to inspect existing default flows: ${existingError.message}`);
  const existingNames = new Set((existing || []).map((flow: unknown) => stringField(asRecord(flow) || {}, 'name')).filter(Boolean));

  for (const def of DEFAULT_FLOWS) {
    if (existingNames.has(def.name)) continue;

    const preparedSteps = await resolveFlowStepProviderConfigs(projectId, def.provider_binding, def.steps);
    const { data: flow, error } = await supabase
      .from('flows')
      .insert({
        project_id: projectId,
        name: def.name,
        description: def.description,
        is_builtin: true,
        default_types: def.default_types,
        provider_binding: def.provider_binding,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to seed flow ${def.name}: ${error.message}`);

    const flowRecord = asRecord(flow);
    const flowId = flowRecord ? stringField(flowRecord, 'id') : null;
    if (!flowId) throw new Error(`Failed to seed flow ${def.name}: missing flow id`);

    const { error: stepsError } = await supabase.from('flow_steps').insert(
      preparedSteps.map(s => ({ ...s, flow_id: flowId }))
    );
    if (stepsError) {
      const { error: cleanupError } = await supabase.from('flows').delete().eq('id', flowId);
      if (cleanupError) console.error(`[flows] Failed to clean up incomplete default flow ${flowId}:`, cleanupError.message);
      throw new Error(`Failed to seed flow steps for ${def.name}: ${stepsError.message}`);
    }
  }
}
