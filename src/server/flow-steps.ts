import { asRecord, stringField } from './authz.js';
import { DEFAULT_FLOWS, type FlowStepRow } from './default-flows.js';
import { supabase } from './supabase.js';

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
}

export function normalizeFlowStep(step: unknown, index: number): FlowStepRow {
  const record = asRecord(step) || {};
  return {
    name: typeof record.name === 'string' ? record.name.trim() : '',
    position: typeof record.position === 'number' ? record.position : index + 1,
    instructions: typeof record.instructions === 'string' ? record.instructions : '',
    model: typeof record.model === 'string' ? record.model : 'opus',
    tools: stringArray(record.tools),
    context_sources: stringArray(record.context_sources, ['task_description', 'previous_step']),
    is_gate: record.is_gate === true,
    on_fail_jump_to: typeof record.on_fail_jump_to === 'number' ? record.on_fail_jump_to : null,
    max_retries: typeof record.max_retries === 'number' ? record.max_retries : 0,
    on_max_retries: typeof record.on_max_retries === 'string' ? record.on_max_retries : 'pause',
    include_agents_md: record.include_agents_md !== false,
  };
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

    const { data: flow, error } = await supabase
      .from('flows')
      .insert({ project_id: projectId, name: def.name, description: def.description, is_builtin: true, default_types: def.default_types })
      .select()
      .single();
    if (error) throw new Error(`Failed to seed flow ${def.name}: ${error.message}`);

    const flowRecord = asRecord(flow);
    const flowId = flowRecord ? stringField(flowRecord, 'id') : null;
    if (!flowId) throw new Error(`Failed to seed flow ${def.name}: missing flow id`);

    const { error: stepsError } = await supabase.from('flow_steps').insert(
      def.steps.map(s => ({ ...s, flow_id: flowId }))
    );
    if (stepsError) {
      const { error: cleanupError } = await supabase.from('flows').delete().eq('id', flowId);
      if (cleanupError) console.error(`[flows] Failed to clean up incomplete default flow ${flowId}:`, cleanupError.message);
      throw new Error(`Failed to seed flow steps for ${def.name}: ${stepsError.message}`);
    }
  }
}
