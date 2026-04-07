import { isMissingRowError } from './authz.js';
import { buildFlowSnapshot, type FlowConfig } from './flow-config.js';
import { loadTaskTypeConfig } from './legacy-task-types.js';
import { supabase } from './supabase.js';

/** Resolve a flow's snapshot, first phase, and maxAttempts from a loaded flow row. */
function resolveFlow(flow: unknown): { flowSnapshot: FlowConfig; firstPhase: string; maxAttempts: number } {
  const flowSnapshot = buildFlowSnapshot(flow);
  const firstPhase = flowSnapshot.steps[0]?.name || 'plan';
  const maxAttempts = flowSnapshot.steps.length > 0
    ? Math.max(...flowSnapshot.steps.map(step => step.max_retries + 1))
    : 1;
  return { flowSnapshot, firstPhase, maxAttempts };
}

/**
 * Resolve flow snapshot + phase config for a task.
 * Tries: 1) task.flow_id, 2) flow with matching default_types, 3) legacy task type config.
 */
export async function resolveFlowForTask(
  task: { flow_id?: string | null; type: string },
  projectId: string,
  localPath: string,
): Promise<{ flowSnapshot: FlowConfig | null; firstPhase: string; maxAttempts: number; flowId: string | null }> {
  if (task.flow_id) {
    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('*, flow_steps(*)')
      .eq('id', task.flow_id)
      .eq('project_id', projectId)
      .single();
    if (flowError && !isMissingRowError(flowError)) throw new Error(flowError.message);
    if (flow) {
      const { flowSnapshot, firstPhase, maxAttempts } = resolveFlow(flow);
      return { flowSnapshot, firstPhase, maxAttempts, flowId: task.flow_id };
    }
    console.warn(`[flow-resolution] Flow ${task.flow_id} not found, falling back to legacy type`);
  }
  // Try to find a flow with this type in default_types
  const { data: flow, error: flowError } = await supabase.from('flows').select('*, flow_steps(*)').eq('project_id', projectId).contains('default_types', [task.type]).limit(1).single();
  if (flowError && !isMissingRowError(flowError)) throw new Error(flowError.message);
  if (flow) {
    const { flowSnapshot, firstPhase, maxAttempts } = resolveFlow(flow);
    return { flowSnapshot, firstPhase, maxAttempts, flowId: flow.id };
  }
  // Legacy task type config
  const taskType = loadTaskTypeConfig(localPath, task.type);
  return { flowSnapshot: null, firstPhase: taskType.phases[0], maxAttempts: taskType.verify_retries + 1, flowId: null };
}
