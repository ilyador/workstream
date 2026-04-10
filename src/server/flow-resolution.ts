import { isMissingRowError } from './authz.js';
import { buildFlowSnapshot, type FlowConfig } from './flow-config.js';
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

async function loadFlowById(projectId: string, flowId: string) {
  const { data: flow, error } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('id', flowId)
    .eq('project_id', projectId)
    .single();
  if (error && !isMissingRowError(error)) throw new Error(error.message);
  return flow;
}

async function loadDefaultTypeFlow(projectId: string, taskType: string) {
  const { data: flows, error } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('project_id', projectId)
    .contains('default_types', [taskType])
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(2);
  if (error && !isMissingRowError(error)) throw new Error(error.message);
  if (!flows?.length) return null;
  if (flows.length > 1) throw new Error(`Multiple default flows are configured for task type "${taskType}"`);
  return flows[0];
}

export async function findDefaultFlowId(projectId: string, taskType: string): Promise<string | null> {
  const flow = await loadDefaultTypeFlow(projectId, taskType);
  return flow?.id ?? null;
}

/**
 * Resolve flow snapshot + phase config for a task.
 * Tries: 1) task.flow_id, 2) flow with matching default_types.
 */
export async function resolveFlowForTask(
  task: { flow_id?: string | null; type: string },
  projectId: string,
): Promise<{ flowSnapshot: FlowConfig; firstPhase: string; maxAttempts: number; flowId: string }> {
  if (task.flow_id) {
    const flow = await loadFlowById(projectId, task.flow_id);
    if (flow) {
      const { flowSnapshot, firstPhase, maxAttempts } = resolveFlow(flow);
      return { flowSnapshot, firstPhase, maxAttempts, flowId: task.flow_id };
    }
    throw new Error(`Assigned flow ${task.flow_id} was not found`);
  }

  const flow = await loadDefaultTypeFlow(projectId, task.type);
  if (flow) {
    const { flowSnapshot, firstPhase, maxAttempts } = resolveFlow(flow);
    return { flowSnapshot, firstPhase, maxAttempts, flowId: flow.id };
  }

  throw new Error('AI tasks require an assigned flow');
}
