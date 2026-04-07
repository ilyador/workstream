import { queueNextWorkstreamTask } from '../auto-continue.js';
import { asRecord, stringField } from '../authz.js';
import { autoCommit } from '../git-utils.js';
import { supabase } from '../supabase.js';
import { booleanField, errorMessage, numericField } from './execution-helpers.js';

export async function markJobApproved(params: {
  jobId: string;
  taskId: string;
  now: string;
}): Promise<string | null> {
  const { jobId, taskId, now } = params;
  const { error: taskUpdateErr } = await supabase.from('tasks').update({ status: 'done', completed_at: now }).eq('id', taskId);
  if (taskUpdateErr) return taskUpdateErr.message;
  const { error: jobUpdateErr } = await supabase.from('jobs').update({ status: 'done', completed_at: now, checkpoint_status: 'cleaned' }).eq('id', jobId);
  if (jobUpdateErr) {
    const { error: rollbackErr } = await supabase.from('tasks').update({ status: 'review', completed_at: null }).eq('id', taskId);
    if (rollbackErr) console.error(`[approve] Failed to roll back task ${taskId}:`, rollbackErr.message);
    return jobUpdateErr.message;
  }
  return null;
}

export async function recordApprovalLog(jobId: string): Promise<void> {
  const { error: logErr } = await supabase.from('job_logs').insert({ job_id: jobId, event: 'done', data: {} });
  if (logErr) console.error(`[approve] Failed to record done log for job ${jobId}:`, logErr.message);
}

export async function runApprovalFollowups(params: {
  taskId: string;
  projectId: string;
  localPath: string;
}): Promise<void> {
  const { data: taskData, error: taskFetchErr } = await supabase
    .from('tasks')
    .select('id, type, title, auto_continue, workstream_id, position')
    .eq('id', params.taskId)
    .single();

  const task = asRecord(taskData);
  if (taskFetchErr) {
    console.error('[approve] Task fetch failed:', taskFetchErr.message);
    return;
  }
  if (!task) return;

  const type = stringField(task, 'type');
  const title = stringField(task, 'title');
  if (type && title) {
    try {
      await autoCommit(params.localPath, type, title);
    } catch (error) {
      console.error('[approve] Auto-commit failed:', errorMessage(error, 'auto-commit failed'));
    }
  }

  if (!booleanField(task, 'auto_continue')) return;
  const workstreamId = stringField(task, 'workstream_id');
  const taskPosition = numericField(task, 'position');
  if (!workstreamId || taskPosition == null) return;
  try {
    await queueNextWorkstreamTask({
      completedTaskId: params.taskId,
      projectId: params.projectId,
      localPath: params.localPath,
      workstreamId,
      completedPosition: taskPosition,
    });
  } catch (error) {
    console.error('[auto-continue] Error:', errorMessage(error, 'auto-continue failed'));
  }
}
