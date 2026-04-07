import { isMissingRowError } from './authz.js';
import { withSortedFlowSteps } from './flow-steps.js';
import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';
import { supabase } from './supabase.js';

export async function broadcastFlowChange(payload: RealtimePayload): Promise<void> {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  const flowId = stringField(record, 'id');
  if (!projectId || !flowId) return;

  if (payload.eventType === 'DELETE') {
    broadcast(projectId, { type: 'flow_deleted', flow_id: flowId });
    return;
  }

  await broadcastFlowById(flowId, projectId);
}

export async function broadcastFlowStepChange(payload: RealtimePayload): Promise<void> {
  const record = projectRecord(payload);
  const flowId = stringField(record, 'flow_id');
  if (!flowId) return;
  await broadcastFlowById(flowId);
}

async function broadcastFlowById(flowId: string, fallbackProjectId?: string): Promise<void> {
  const { data: flow, error } = await supabase.from('flows').select('*, flow_steps(*)').eq('id', flowId).single();
  if (error) {
    if (!isMissingRowError(error)) console.error(`[realtime] Failed to load flow ${flowId}:`, error.message);
    if (fallbackProjectId) broadcast(fallbackProjectId, { type: 'full_sync' });
    return;
  }
  const projectId = flow && typeof flow.project_id === 'string' ? flow.project_id : fallbackProjectId;
  if (!projectId) return;
  broadcast(projectId, { type: 'flow_changed', flow: withSortedFlowSteps(flow) });
}
