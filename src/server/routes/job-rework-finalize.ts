import { asRecord, stringField, type DbRecord } from '../authz.js';
import { supabase } from '../supabase.js';
import { cleanupQueuedReworkJob } from './job-rework-utils.js';

export function reworkTaskRollback(task: DbRecord): Record<string, unknown> {
  return {
    status: stringField(task, 'status') || 'review',
    followup_notes: task.followup_notes ?? null,
    completed_at: task.completed_at ?? null,
  };
}

export async function markTaskInProgressForRework(params: {
  taskId: string;
  note: unknown;
}): Promise<string | null> {
  const { error } = await supabase.from('tasks').update({
    status: 'in_progress',
    completed_at: null,
    followup_notes: typeof params.note === 'string' ? params.note : null,
  }).eq('id', params.taskId);
  return error ? error.message : null;
}

export async function completeOriginalJobForRework(params: {
  jobId: string;
  taskId: string;
  newJob: unknown;
  taskRollback: Record<string, unknown>;
  now: string;
}): Promise<string | null> {
  const { data: logRow, error: logErr } = await supabase
    .from('job_logs')
    .insert({ job_id: params.jobId, event: 'done', data: {} })
    .select('id')
    .single();
  if (logErr) {
    const { error: rollbackErr } = await supabase.from('tasks').update(params.taskRollback).eq('id', params.taskId);
    if (rollbackErr) console.error(`[rework] Failed to roll back task ${params.taskId}:`, rollbackErr.message);
    await cleanupQueuedReworkJob(params.newJob);
    return logErr.message;
  }

  const { error: oldJobUpdateErr } = await supabase.from('jobs').update({
    status: 'done',
    completed_at: params.now,
    checkpoint_status: 'cleaned',
  }).eq('id', params.jobId);
  if (!oldJobUpdateErr) return null;

  const logRecord = asRecord(logRow);
  const logId = logRecord ? logRecord.id : null;
  if (typeof logId === 'number') {
    const { error: logDeleteErr } = await supabase.from('job_logs').delete().eq('id', logId);
    if (logDeleteErr) console.error(`[rework] Failed to remove stale rework log ${logId}:`, logDeleteErr.message);
  }
  const { error: rollbackErr } = await supabase.from('tasks').update(params.taskRollback).eq('id', params.taskId);
  if (rollbackErr) console.error(`[rework] Failed to roll back task ${params.taskId}:`, rollbackErr.message);
  await cleanupQueuedReworkJob(params.newJob);
  return oldJobUpdateErr.message;
}
