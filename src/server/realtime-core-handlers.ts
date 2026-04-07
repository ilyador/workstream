import { isMissingRowError } from './authz.js';
import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';
import { supabase } from './supabase.js';

export function broadcastTaskChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  broadcast(projectId, {
    type: payload.eventType === 'DELETE' ? 'task_deleted' : 'task_changed',
    task: record,
  });
}

export function broadcastJobChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  broadcast(projectId, {
    type: payload.eventType === 'DELETE' ? 'job_deleted' : 'job_changed',
    job: record,
  });
}

export function broadcastWorkstreamChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  if (payload.eventType === 'DELETE') {
    const workstreamId = stringField(record, 'id');
    if (workstreamId) broadcast(projectId, { type: 'workstream_deleted', workstream_id: workstreamId });
    return;
  }
  broadcast(projectId, { type: 'workstream_changed', workstream: record });
}

export async function broadcastTaskScopedChange(payload: RealtimePayload, type: string): Promise<void> {
  const record = projectRecord(payload);
  const taskId = stringField(record, 'task_id');
  if (!taskId) return;
  const { data: task, error } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
  if (error && !isMissingRowError(error)) console.error(`[realtime] Failed to load ${type} task project:`, error.message);
  const projectId = task && typeof task.project_id === 'string' ? task.project_id : null;
  if (!projectId) return;
  broadcast(projectId, {
    type: payload.eventType === 'DELETE' ? `${type}_deleted` : `${type}_changed`,
    task_id: taskId,
  });
}
