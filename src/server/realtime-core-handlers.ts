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

export async function lookupProjectId(table: 'tasks' | 'workstreams', id: string): Promise<string | null> {
  const { data, error } = await supabase.from(table).select('project_id').eq('id', id).single();
  if (error) {
    if (!isMissingRowError(error)) console.error(`[realtime] Failed to resolve project_id from ${table}:`, error.message);
    return null;
  }
  return data && typeof data.project_id === 'string' && data.project_id.length > 0 ? data.project_id : null;
}

export async function broadcastTaskScopedChange(payload: RealtimePayload, type: string): Promise<void> {
  const record = projectRecord(payload);
  const taskId = stringField(record, 'task_id');
  if (!taskId) return;
  const projectId = await lookupProjectId('tasks', taskId);
  if (!projectId) return;
  broadcast(projectId, {
    type: payload.eventType === 'DELETE' ? `${type}_deleted` : `${type}_changed`,
    task_id: taskId,
  });
}
