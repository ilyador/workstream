export interface FlowStepConfig {
  position: number;
  name: string;
  instructions: string;
  model: string;
  tools: string[];
  context_sources: string[];
  is_gate: boolean;
  on_fail_jump_to: number | null;
  max_retries: number;
  on_max_retries: 'pause' | 'fail' | 'skip';
  include_agents_md: boolean;
}

export interface FlowConfig {
  flow_name: string;
  agents_md: string | null;
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
  const rawSteps = Array.isArray(flowRecord.flow_steps) ? flowRecord.flow_steps : [];
  const steps = rawSteps
    .map(step => record(step))
    .sort((a, b) => numberValue(a.position, 0) - numberValue(b.position, 0))
    .map(step => ({
      position: numberValue(step.position, 0),
      name: stringValue(step.name, 'step'),
      instructions: stringValue(step.instructions, ''),
      model: stringValue(step.model, 'opus'),
      tools: stringArray(step.tools, []),
      context_sources: stringArray(step.context_sources, ['task_description', 'previous_step']),
      is_gate: step.is_gate === true,
      on_fail_jump_to: typeof step.on_fail_jump_to === 'number' ? step.on_fail_jump_to : null,
      max_retries: numberValue(step.max_retries, 0),
      on_max_retries: onMaxRetries(step.on_max_retries),
      include_agents_md: step.include_agents_md !== false,
    }));

  return {
    flow_name: stringValue(flowRecord.name, 'Unnamed flow'),
    agents_md: typeof flowRecord.agents_md === 'string' ? flowRecord.agents_md : null,
    steps,
  };
}
