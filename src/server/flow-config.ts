import { normalizeFlowProviderBinding, type FlowProviderBinding } from '../shared/flow-provider-binding.js';

export interface FlowStepConfig {
  position: number;
  name: string;
  instructions: string;
  model: string;
  provider_config_id: string | null;
  tools: string[];
  context_sources: string[];
  is_gate: boolean;
  on_fail_jump_to: number | null;
  max_retries: number;
  on_max_retries: 'pause' | 'fail' | 'skip';
}

export interface FlowConfig {
  flow_name: string;
  agents_md: string | null;
  provider_binding: FlowProviderBinding;
  steps: FlowStepConfig[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : fallback;
}

function onMaxRetries(value: unknown): FlowStepConfig['on_max_retries'] {
  return value === 'pause' || value === 'fail' || value === 'skip' ? value : 'pause';
}

export function buildFlowSnapshot(flow: unknown): FlowConfig {
  const flowRecord = record(flow);
  const providerBinding = normalizeFlowProviderBinding(
    typeof flowRecord.provider_binding === 'string' ? flowRecord.provider_binding : null,
  );
  const fallbackModel = providerBinding === 'task_selected' ? 'task:selected' : 'claude:sonnet';
  const rawSteps = Array.isArray(flowRecord.flow_steps) ? flowRecord.flow_steps : [];
  const steps = rawSteps
    .map(step => record(step))
    .sort((a, b) => numberValue(a.position, 0) - numberValue(b.position, 0))
    .map(step => ({
      position: numberValue(step.position, 0),
      name: stringValue(step.name, 'step'),
      instructions: stringValue(step.instructions, ''),
      model: stringValue(step.model, fallbackModel),
      provider_config_id: typeof step.provider_config_id === 'string' ? step.provider_config_id : null,
      tools: stringArray(step.tools, []),
      context_sources: stringArray(step.context_sources, ['task_description', 'previous_step']),
      is_gate: step.is_gate === true,
      on_fail_jump_to: typeof step.on_fail_jump_to === 'number' ? step.on_fail_jump_to : null,
      max_retries: numberValue(step.max_retries, 0),
      on_max_retries: onMaxRetries(step.on_max_retries),
    }));

  return {
    flow_name: stringValue(flowRecord.name, 'Unnamed flow'),
    agents_md: typeof flowRecord.agents_md === 'string' ? flowRecord.agents_md : null,
    provider_binding: providerBinding,
    steps,
  };
}
